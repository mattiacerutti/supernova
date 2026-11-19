import {afterEach, describe, expect, it, vi} from "vitest";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {ChatService} from "@supernova/contracts/services/chat/services";
import {createPiTestRuntime, waitUntil} from "@tests/support/test-runtime";

describe("archiving a session", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  it("stops execution, clears notices and retains the archived record", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    const {operations, defaultProjectRoot: projectPath} = pi;
    const session = {id: "archived"};
    await operations.create({id: session.id, projectPath});
    await pi.store.changeStatus(session.id, {kind: "notice", notice: {level: "warning", message: "A retained notice"}});
    (await pi.server.client.get(ChatService, {sessionId: session.id}, BACKGROUND_CONTEXT, {readyTimeout: 500})).release();

    const result = await operations.archive({sessionId: session.id, projectPath});

    expect(result).toEqual({sessionId: session.id, projectPath});
    await expect(pi.server.client.get(ChatService, {sessionId: session.id}, BACKGROUND_CONTEXT, {readyTimeout: 500})).rejects.toMatchObject({code: "unavailable"});
    expect(pi.statuses().sessions[session.id]).toBeUndefined();
    expect(await pi.store.record(session.id)).toBeNull();
    expect(await pi.store.find(session.id)).toMatchObject({id: session.id, archivedAt: expect.any(String)});
  });

  it.each([
    {running: true, fails: false},
    {running: false, fails: false},
    {running: true, fails: true},
    {running: false, fails: true},
  ])("blocks reopening throughout checkpoint cleanup (running=$running, fails=$fails)", async ({running, fails}) => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    const {operations, defaultProjectRoot: projectPath} = pi;
    const sessionId = "archiving";
    await operations.create({id: sessionId, projectPath});

    if (!running) {
      await pi.chat.stop(sessionId);
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
    const deleteSession = pi.checkpointStore.deleteSession.bind(pi.checkpointStore);
    const gate = vi.spyOn(pi.checkpointStore, "deleteSession").mockImplementation(async (input) => {
      entered();
      await paused;

      if (fails) throw new Error("Checkpoint cleanup failed.");
      await deleteSession(input);
    });

    const archiving = operations.archive({sessionId, projectPath});
    const completed = fails ? expect(archiving).rejects.toThrow("Checkpoint cleanup failed.") : expect(archiving).resolves.toEqual({sessionId, projectPath});

    try {
      await deleting;
      expect(await pi.store.record(sessionId)).toBeNull();
      await expect(operations.archive({sessionId, projectPath})).rejects.toThrow("Session is already archived.");

      if (held) {
        await waitUntil(() =>
          expect(held.state.value).toMatchObject({
            kind: "failed",
            cause: {error: {code: "unavailable"}},
          })
        );
      }

      await operations.create({id: "other", projectPath});
      expect(await pi.store.find("other")).toBeDefined();

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

    expect(await pi.store.record(sessionId)).toBeNull();
    await expect(returning.host.get(ChatService, {sessionId}, BACKGROUND_CONTEXT, {readyTimeout: 500})).rejects.toMatchObject({code: "unavailable"});
  });

  it("accepts only one of two concurrent archives", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    const {operations, defaultProjectRoot: projectPath} = pi;
    const sessionId = "concurrent";
    await operations.create({id: sessionId, projectPath});

    const results = await Promise.allSettled([operations.archive({sessionId, projectPath}), operations.archive({sessionId, projectPath})]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: {code: "ArchiveSessionError", message: "Session is already archived."},
    });
    await expect(pi.server.client.get(ChatService, {sessionId}, BACKGROUND_CONTEXT, {readyTimeout: 500})).rejects.toMatchObject({code: "unavailable"});
  });

  it("rejects an unknown session with the archive error", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    await expect(pi.operations.archive({sessionId: "missing", projectPath: pi.defaultProjectRoot})).rejects.toMatchObject({
      code: "ArchiveSessionError",
      message: "Session not found.",
    });
  });
});
