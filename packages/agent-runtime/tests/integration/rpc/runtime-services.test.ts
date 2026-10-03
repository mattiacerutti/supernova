import {createRemoteServiceBinding} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {Client, createClientServiceTransport} from "@earendil-works/pi-client";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {FoldersService} from "@supernova/contracts/folders/services";
import {RUNTIME_SERVER_ID} from "@supernova/contracts/runtime/services";
import {SessionController, SessionDirectory, SessionManagement, SessionTranscript} from "@supernova/contracts/sessions/services";
import {TerminalsService} from "@supernova/contracts/terminals/services";
import {WorkspaceService} from "@supernova/contracts/workspace/services";
import {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/providers";
import {createSpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {afterEach, describe, expect, it} from "vitest";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents, waitUntil} from "@tests/support/session-runtime";
import {startRuntimeServer} from "@tests/support/runtime-server";

const firstMessage = {contentParts: [{text: "Hi", type: "text" as const}], modelReference: selectedModelReference};

describe("runtime services over the wire", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  /** A real `pi-server` over the runtime's services and a `pi-client` connected to it, with both service bindings. */
  async function connect() {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());
    const terminals = new Terminals({spawnPty: createSpawnPty()});
    cleanups.push(() => terminals.dispose());
    // Every service the edge serves needs its feature; the ones these tests never call are inert.
    const runtime = {
      configuration: new Configuration(),
      extensions: {} as AgentRuntime["extensions"],
      folders: new Folders(),
      projects: pi.projects,
      providers: new Providers({loginSessions: new LoginSessions(), sdk: pi.sdk}),
      sessionRuntime: pi.sessionRuntime,
      sessions: pi.sessions,
      workspace: new Workspace({terminals}),
      worktrees: new Worktrees(),
    } as AgentRuntime;
    const server = await startRuntimeServer(runtime);
    cleanups.push(server.close);
    const client = await Client.connect({serverId: RUNTIME_SERVER_ID, transportFactory: server.transport});
    cleanups.push(() => client.dispose());
    const serverServices = createRemoteServiceBinding({
      services: [FoldersService, SessionDirectory, SessionManagement, TerminalsService, WorkspaceService],
      transport: createClientServiceTransport(client, () => ({serverId: RUNTIME_SERVER_ID})),
    });
    const sessionServices = createRemoteServiceBinding({
      services: [SessionController, SessionTranscript],
      transport: createClientServiceTransport(client, () => client.attachment),
      bound: false,
    });
    cleanups.push(async () => {
      await sessionServices.dispose(BACKGROUND_CONTEXT);
      await serverServices.dispose(BACKGROUND_CONTEXT);
    });
    const management = serverServices.use(SessionManagement);
    const directory = serverServices.use(SessionDirectory).state;
    await serverServices.ready(BACKGROUND_CONTEXT);
    const attach = async (sessionId: string) => {
      expect(await management.attach(sessionId, BACKGROUND_CONTEXT)).toEqual({ok: true, value: null});
      await sessionServices.rebind(true, BACKGROUND_CONTEXT);
      const controller = sessionServices.use(SessionController);
      const transcript = sessionServices.use(SessionTranscript).state;
      await sessionServices.ready(BACKGROUND_CONTEXT);
      return {controller, transcript};
    };
    const folders = serverServices.use(FoldersService);
    const terminalService = serverServices.use(TerminalsService);
    const workspace = serverServices.use(WorkspaceService);
    return {attach, directory, folders, management, pi, terminals: terminalService, workspace};
  }

  it("creates a session, runs its turn, and replicates its transcript to the attached client", async () => {
    const {attach, directory, management, pi} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("Hello!"), fauxAssistantMessage("Again.")]);

    const created = await management.create({id: "wire-session", message: firstMessage, projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT);
    expect(created.ok && turnContents(created.value)).toEqual([firstMessage.contentParts]);

    const {controller, transcript} = await attach("wire-session");
    const seen: Session[] = [];
    const stop = transcript.subscribe((value) => void seen.push(value));
    try {
      await pi.settled("wire-session");
      await waitUntil(async () => expect(transcript.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
      expect(assistantTexts(transcript.value!)).toEqual(["Hello!"]);

      // A command through the controller streams back through the same replicated state.
      expect(await controller.send({contentParts: [{text: "More", type: "text"}], modelReference: selectedModelReference}, BACKGROUND_CONTEXT)).toEqual({ok: true, value: null});
      await pi.settled("wire-session");
      await waitUntil(async () => expect(transcript.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
      expect(assistantTexts(transcript.value!)).toEqual(["Hello!", "Again."]);
      expect(seen.some((value) => value.live.run !== undefined)).toBe(true);
    } finally {
      stop();
    }

    expect(directory.value?.sessions["wire-session"]).toMatchObject({activity: "idle", projectPath: pi.defaultProjectRoot, summary: {id: "wire-session"}});
  });

  it("returns declared contract errors by tag, and every other failure as a GenericError", async () => {
    const {attach, management, pi} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("one")]);
    await management.create({id: "errors", message: firstMessage, projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT);
    await pi.settled("errors");
    const {controller} = await attach("errors");

    // A plain error thrown by a checkpoint method is undeclared, so it is a GenericError, never a declared one such as
    // CheckpointConflictError (which would offer to discard changes).
    expect(await controller.redo({}, BACKGROUND_CONTEXT)).toEqual({ok: false, error: {code: "GenericError", message: "No checkpoint is available to redo."}});
    expect(await controller.send({contentParts: [{text: "x", type: "text"}], modelReference: {...selectedModelReference, id: "missing-model"}}, BACKGROUND_CONTEXT)).toEqual({
      ok: false,
      error: {code: "GenericError", message: "Selected model is not available."},
    });
    // A declared error keeps its own tag and message.
    expect(await management.rename({sessionId: "errors", title: " "}, BACKGROUND_CONTEXT)).toEqual({
      ok: false,
      error: {code: "RenameSessionError", message: "Session title cannot be empty."},
    });
    expect(await management.attach("unknown", BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "GenericError"}});
    expect(await controller.abort(BACKGROUND_CONTEXT)).toEqual({ok: true, value: null});
  });

  it("serves the non-session services: calls return results or tagged errors, terminal output replicates", async () => {
    const {folders, pi, terminals, workspace} = await connect();

    const created = await folders.create({path: `${pi.defaultProjectRoot}/made-over-the-wire`}, BACKGROUND_CONTEXT);
    expect(created).toEqual({ok: true, value: {path: `${pi.defaultProjectRoot}/made-over-the-wire`}});
    // The default project is a plain folder, not a Git repository.
    expect(await workspace.listBranches({projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "WorkspaceNotARepositoryError"}});
    // Payloads are validated at the boundary.
    expect(await workspace.readFile({path: 1} as never, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "GenericError", message: "The request is invalid."}});

    const shell = process.env.SHELL;
    process.env.SHELL = "/bin/sh";
    try {
      expect(await terminals.open({cols: 80, cwd: pi.defaultProjectRoot, id: "wire-terminal", rows: 24, sessionId: "s"}, BACKGROUND_CONTEXT)).toMatchObject({ok: true});
      await terminals.write({data: "echo WIRE_$((20+1))\n", id: "wire-terminal"}, BACKGROUND_CONTEXT);
      await waitUntil(() => expect(terminals.state.value?.terminals["wire-terminal"]?.output).toContain("WIRE_21"), {timeoutMs: 5_000});
      expect(await terminals.write({data: "x", id: "missing"}, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "TerminalNotFoundError"}});
    } finally {
      process.env.SHELL = shell;
    }
  });
});
