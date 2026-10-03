import {createRemoteServiceBinding} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {Client, createClientServiceTransport} from "@earendil-works/pi-client";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {RUNTIME_SERVER_ID} from "@supernova/contracts/lib/protocol";
import {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {WorkspaceService} from "@supernova/contracts/services/workspace/services";
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
      services: [FoldersService, SessionsService, WorkspaceService],
      transport: createClientServiceTransport(client, () => ({serverId: RUNTIME_SERVER_ID})),
    });
    const sessionServices = createRemoteServiceBinding({
      services: [SessionRuntimeService],
      transport: createClientServiceTransport(client, () => client.attachment),
      bound: false,
    });
    cleanups.push(async () => {
      await sessionServices.dispose(BACKGROUND_CONTEXT);
      await serverServices.dispose(BACKGROUND_CONTEXT);
    });
    const sessions = serverServices.use(SessionsService);
    await serverServices.ready(BACKGROUND_CONTEXT);
    const attach = async (sessionId: string) => {
      expect(await sessions.attach(sessionId, BACKGROUND_CONTEXT)).toEqual({ok: true, value: null});
      await sessionServices.rebind(true, BACKGROUND_CONTEXT);
      await sessionServices.ready(BACKGROUND_CONTEXT);
      // In a record: a Chord facade answers `then` too, so awaiting one directly would call a remote `then`.
      return {sessionRuntime: sessionServices.use(SessionRuntimeService)};
    };
    return {attach, folders: serverServices.use(FoldersService), pi, sessions, workspace: serverServices.use(WorkspaceService)};
  }

  it("creates a session, runs its turn, and replicates its transcript to the attached client", async () => {
    const {attach, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("Hello!"), fauxAssistantMessage("Again.")]);

    const created = await sessions.create({id: "wire-session", message: firstMessage, projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT);
    expect(created.ok && turnContents(created.value)).toEqual([firstMessage.contentParts]);

    const {sessionRuntime} = await attach("wire-session");
    const seen: Session[] = [];
    const stop = sessionRuntime.session.subscribe((value) => void seen.push(value));
    try {
      await pi.settled("wire-session");
      await waitUntil(async () => expect(sessionRuntime.session.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
      expect(assistantTexts(sessionRuntime.session.value!)).toEqual(["Hello!"]);

      // A command streams back through the same replicated state.
      expect(await sessionRuntime.sendMessage({contentParts: [{text: "More", type: "text"}], modelReference: selectedModelReference}, BACKGROUND_CONTEXT)).toEqual({
        ok: true,
        value: null,
      });
      await pi.settled("wire-session");
      await waitUntil(async () => expect(sessionRuntime.session.value).toEqual(await pi.sessions.get({sessionId: "wire-session"})));
      expect(assistantTexts(sessionRuntime.session.value!)).toEqual(["Hello!", "Again."]);
      expect(seen.some((value) => value.live.run !== undefined)).toBe(true);
    } finally {
      stop();
    }

    expect(sessions.directory.value?.sessions["wire-session"]).toMatchObject({activity: "idle", projectPath: pi.defaultProjectRoot, summary: {id: "wire-session"}});
  });

  it("returns declared contract errors by tag, and every other failure as a GenericError", async () => {
    const {attach, pi, sessions} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("one")]);
    await sessions.create({id: "errors", message: firstMessage, projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT);
    await pi.settled("errors");
    const {sessionRuntime} = await attach("errors");

    // A plain error thrown by a checkpoint method is undeclared, so it is a GenericError, never a declared one such as
    // CheckpointConflictError (which would offer to discard changes).
    expect(await sessionRuntime.redoCheckpoint({}, BACKGROUND_CONTEXT)).toEqual({ok: false, error: {code: "GenericError", message: "No checkpoint is available to redo."}});
    expect(
      await sessionRuntime.sendMessage({contentParts: [{text: "x", type: "text"}], modelReference: {...selectedModelReference, id: "missing-model"}}, BACKGROUND_CONTEXT)
    ).toEqual({
      ok: false,
      error: {code: "GenericError", message: "Selected model is not available."},
    });
    // A declared error keeps its own tag and message.
    expect(await sessions.rename({sessionId: "errors", title: " "}, BACKGROUND_CONTEXT)).toEqual({
      ok: false,
      error: {code: "RenameSessionError", message: "Session title cannot be empty."},
    });
    expect(await sessions.attach("unknown", BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "GenericError"}});
    expect(await sessionRuntime.abort(BACKGROUND_CONTEXT)).toEqual({ok: true, value: null});
  });

  it("serves the non-session services: calls return results or tagged errors, terminal output replicates", async () => {
    const {folders, pi, workspace} = await connect();

    const created = await folders.create({path: `${pi.defaultProjectRoot}/made-over-the-wire`}, BACKGROUND_CONTEXT);
    expect(created).toEqual({ok: true, value: {path: `${pi.defaultProjectRoot}/made-over-the-wire`}});
    // The default project is a plain folder, not a Git repository.
    expect(await workspace.listBranches({projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "WorkspaceNotARepositoryError"}});
    // A member of an error union (`WorkspaceFileError`) keeps its own tag.
    expect(await workspace.readFile({path: "../outside", projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT)).toMatchObject({
      ok: false,
      error: {code: "WorkspaceFileNotFoundError"},
    });
    // Payloads are validated at the boundary.
    expect(await workspace.readFile({path: 1} as never, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "GenericError", message: "The request is invalid."}});

    const shell = process.env.SHELL;
    process.env.SHELL = "/bin/sh";
    try {
      expect(await workspace.openTerminal({cols: 80, cwd: pi.defaultProjectRoot, id: "wire-terminal", rows: 24, sessionId: "s"}, BACKGROUND_CONTEXT)).toMatchObject({ok: true});
      await workspace.writeTerminal({data: "echo WIRE_$((20+1))\n", id: "wire-terminal"}, BACKGROUND_CONTEXT);
      await waitUntil(() => expect(workspace.terminals.value?.terminals["wire-terminal"]?.output).toContain("WIRE_21"), {timeoutMs: 5_000});
      expect(await workspace.writeTerminal({data: "x", id: "missing"}, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "TerminalNotFoundError"}});
    } finally {
      process.env.SHELL = shell;
    }
  });
});
