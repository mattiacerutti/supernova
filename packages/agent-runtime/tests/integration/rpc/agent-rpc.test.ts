import {existsSync} from "node:fs";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRpcGroup} from "@supernova/contracts";
import type {CreateSessionPayload} from "@supernova/contracts/sessions/procedures";
import {Effect} from "effect";
import {RpcTest} from "effect/unstable/rpc";
import {afterEach, describe, expect, it} from "vitest";
import {agentRpcLayer} from "@supernova/agent-runtime/rpc/agent-rpc";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {cleanupTempDirs} from "@tests/support/async";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference} from "@tests/support/session-runtime";

const firstMessage = {contentParts: [{text: "Hi", type: "text" as const}], modelReference: selectedModelReference};

describe("agent rpc: createSession", () => {
  const runtimes: Array<{unregister: () => void}> = [];
  const tempDirs: string[] = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
    cleanupTempDirs(tempDirs);
  });

  /** Drives the RPC layer over a test runtime whose sessions live on disk and are reopened by the worker, as in production. */
  async function setup() {
    const sessionDir = await mkdtemp(join(tmpdir(), "supernova-rpc-"));
    tempDirs.push(sessionDir);
    const pi = await createPiTestRuntime({reopenManagers: true, sessionDir});
    runtimes.push(pi);
    // Only the two features createSession orchestrates are real; the rest are never reached.
    const runtime = {sessionRuntime: pi.sessionRuntime, sessions: pi.sessions} as AgentRuntime;
    const createSession = (payload: CreateSessionPayload) =>
      Effect.runPromise(Effect.scoped(Effect.flatMap(RpcTest.makeClient(AgentRpcGroup), (client) => client.createSession(payload))).pipe(Effect.provide(agentRpcLayer(runtime))));
    return {createSession, pi};
  }

  it("creates the session and starts its first turn in one call", async () => {
    const {createSession, pi} = await setup();
    pi.faux.setResponses([fauxAssistantMessage("Hello!")]);

    const events = await pi.collectEvents(
      () => createSession({id: "first-send", message: firstMessage, projectPath: "/workspace"}),
      (events) => {
        if (!events.some((event) => event.type === "session.snapshot" && event.sessionId === "first-send" && event.session.turns.length === 1))
          throw new Error("No final snapshot.");
      }
    );

    expect(events.findLast((event) => event.type === "session.snapshot")).toMatchObject({
      session: {id: "first-send", turns: [{userMessage: {contentParts: firstMessage.contentParts}}]},
    });
  });

  it("removes the session again when its first turn cannot start", async () => {
    const {createSession, pi} = await setup();
    const unknownModel = {...selectedModelReference, id: "missing-model"};

    await expect(createSession({id: "doomed", message: {...firstMessage, modelReference: unknownModel}, projectPath: "/workspace"})).rejects.toMatchObject({
      _tag: "CreateSessionError",
    });

    expect(existsSync(pi.getSession("doomed")?.info.path ?? "")).toBe(false);
  });

  it("creates an empty session when no message is given", async () => {
    const {createSession, pi} = await setup();

    const session = await createSession({id: "empty", projectPath: "/workspace"});

    expect(session).toMatchObject({id: "empty", turns: []});
    expect(existsSync(pi.getSession("empty")?.info.path ?? "")).toBe(true);
  });
});
