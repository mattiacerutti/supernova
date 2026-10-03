import {createRemoteServiceBinding} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {Client, createClientServiceTransport} from "@earendil-works/pi-client";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {SESSION_SERVER_ID, SessionController, SessionDirectory, SessionManagement, SessionTranscript} from "@supernova/contracts/sessions/services";
import {afterEach, describe, expect, it} from "vitest";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/worktrees";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents, waitUntil} from "@tests/support/session-runtime";
import {startSessionServer} from "@tests/support/session-server";

const firstMessage = {contentParts: [{text: "Hi", type: "text" as const}], modelReference: selectedModelReference};

describe("session services over the wire", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  /** A real `pi-server` over the runtime's services and a `pi-client` connected to it, with both service bindings. */
  async function connect() {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());
    const runtime = {sessionRuntime: pi.sessionRuntime, sessions: pi.sessions, worktrees: new Worktrees()} as AgentRuntime;
    const server = await startSessionServer(runtime);
    cleanups.push(server.close);
    const client = await Client.connect({serverId: SESSION_SERVER_ID, transportFactory: server.transport});
    cleanups.push(() => client.dispose());
    const serverServices = createRemoteServiceBinding({
      services: [SessionDirectory, SessionManagement],
      transport: createClientServiceTransport(client, () => ({serverId: SESSION_SERVER_ID})),
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
    return {attach, directory, management, pi};
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

  it("returns contract errors by tag instead of failing the call", async () => {
    const {attach, management, pi} = await connect();
    pi.faux.setResponses([fauxAssistantMessage("one")]);
    await management.create({id: "errors", message: firstMessage, projectPath: pi.defaultProjectRoot}, BACKGROUND_CONTEXT);
    await pi.settled("errors");
    const {controller} = await attach("errors");

    expect(await controller.redo({}, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "CheckpointGenericError", message: "No checkpoint is available to redo."}});
    expect(await controller.send({contentParts: [{text: "x", type: "text"}], modelReference: {...selectedModelReference, id: "missing-model"}}, BACKGROUND_CONTEXT)).toMatchObject({
      ok: false,
      error: {code: "SessionCommandError"},
    });
    expect(await management.rename({sessionId: "errors", title: " "}, BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "RenameSessionError"}});
    expect(await management.attach("unknown", BACKGROUND_CONTEXT)).toMatchObject({ok: false, error: {code: "LoadSessionError"}});
  });
});
