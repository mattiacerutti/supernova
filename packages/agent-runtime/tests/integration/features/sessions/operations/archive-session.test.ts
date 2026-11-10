import {afterEach, describe, expect, it, vi} from "vitest";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import {archiveSession} from "@supernova/agent-runtime/features/sessions/operations/archive-session";
import {createSession} from "@supernova/agent-runtime/features/sessions/operations/create-session";
import {createPiTestRuntime, waitUntil} from "@tests/support/session-runtime";

describe("archiving a session", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  it("stops execution, clears notices and retains the archived record", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    const {runtime, defaultProjectRoot: projectPath} = pi;
    const session = {id: "archived"};
    await createSession({id: session.id, projectPath}, runtime);
    runtime.status.change(session.id, {kind: "notice", notice: {level: "warning", message: "A retained notice"}});
    (await pi.server.client.get(ChatService, {sessionId: session.id}, BACKGROUND_CONTEXT, {readyTimeout: 500})).release();

    const result = await archiveSession({sessionId: session.id, projectPath}, runtime);

    expect(result).toEqual({sessionId: session.id, projectPath});
    await expect(pi.server.client.get(ChatService, {sessionId: session.id}, BACKGROUND_CONTEXT, {readyTimeout: 500})).rejects.toMatchObject({code: "unavailable"});
    expect(runtime.status.all().sessions[session.id]).toBeUndefined();
    expect(await runtime.sessions.record({sessionId: session.id})).toBeNull();
    expect(await runtime.store.find(session.id)).toMatchObject({id: session.id, archivedAt: expect.any(String)});
  });

  it.each([
    {running: true, fails: false},
    {running: false, fails: false},
    {running: true, fails: true},
    {running: false, fails: true},
  ])("blocks reopening throughout checkpoint cleanup (running=$running, fails=$fails)", async ({running, fails}) => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    const {runtime, defaultProjectRoot: projectPath} = pi;
    const sessionId = "archiving";
    await createSession({id: sessionId, projectPath}, runtime);

    if (!running) {
      await pi.sessionRuntime.stop(sessionId);
    }

    const held = running ? await pi.server.client.get(ChatService, {sessionId}, BACKGROUND_CONTEXT) : undefined;
    if (held) cleanups.push(async () => held.release());

    let entered!: () => void;
    let resume!: () => void;
    const deleting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const deleteSession = runtime.checkpointStore.deleteSession.bind(runtime.checkpointStore);
    const gate = vi.spyOn(runtime.checkpointStore, "deleteSession").mockImplementation(async (input) => {
      entered();
      await paused;

      if (fails) throw new Error("Checkpoint cleanup failed.");
      await deleteSession(input);
    });

    const archiving = archiveSession({sessionId, projectPath}, runtime);
    const completed = fails ? expect(archiving).rejects.toThrow("Checkpoint cleanup failed.") : expect(archiving).resolves.toEqual({sessionId, projectPath});

    try {
      await deleting;
      expect(await runtime.sessions.record({sessionId})).toBeNull();
      await expect(archiveSession({sessionId, projectPath}, runtime)).rejects.toThrow("Session is already archived.");

      if (held) {
        await waitUntil(() =>
          expect(held.state.value).toMatchObject({
            kind: "failed",
            cause: {error: {code: "unavailable"}},
          })
        );
      }

      await createSession({id: "other", projectPath}, runtime);
      expect(runtime.store.find("other")).toBeDefined();

      const browser = await pi.server.connectClient();
      await expect(browser.host.get(ChatService, {sessionId}, BACKGROUND_CONTEXT, {readyTimeout: 500})).rejects.toMatchObject({code: "unavailable"});
    } finally {
      resume();
      await completed;
      gate.mockRestore();
    }

    const returning = await pi.server.connectClient();

    if (held) {
      await waitUntil(() =>
        expect(held.state.value).toMatchObject({
          kind: "failed",
          cause: {error: {code: "unavailable"}},
        })
      );
    }

    expect(await runtime.sessions.record({sessionId})).toBeNull();
    await expect(returning.host.get(ChatService, {sessionId}, BACKGROUND_CONTEXT, {readyTimeout: 500})).rejects.toMatchObject({code: "unavailable"});
  });

  it("accepts only one of two concurrent archives", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    const {runtime, defaultProjectRoot: projectPath} = pi;
    const sessionId = "concurrent";
    await createSession({id: sessionId, projectPath}, runtime);

    const results = await Promise.allSettled([archiveSession({sessionId, projectPath}, runtime), archiveSession({sessionId, projectPath}, runtime)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: {code: "ArchiveSessionError", message: "Session is already archived."},
    });
    await expect(pi.server.client.get(ChatService, {sessionId}, BACKGROUND_CONTEXT, {readyTimeout: 500})).rejects.toMatchObject({code: "unavailable"});
  });

  it("rejects an unknown session with the archive error", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    await expect(archiveSession({sessionId: "missing", projectPath: pi.defaultProjectRoot}, pi.runtime)).rejects.toMatchObject({
      code: "ArchiveSessionError",
      message: "Session not found.",
    });
  });
});
