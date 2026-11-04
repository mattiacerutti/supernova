import {afterEach, describe, expect, it} from "vitest";
import {archiveSession} from "@supernova/agent-runtime/features/sessions/operations/archive-session";
import {createSession} from "@supernova/agent-runtime/features/sessions/operations/create-session";
import {createPiTestRuntime} from "@tests/support/session-runtime";

describe("archiving a session", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  it("stops execution, clears notices and retains the archived record", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    const {runtime, defaultProjectRoot: projectPath} = pi;
    const session = await createSession({id: "archived", projectPath}, runtime);
    runtime.status.change(session.id, {kind: "notice", notice: {level: "warning", message: "A retained notice"}});
    expect(runtime.sessionHosts.running(session.id)).toBe(true);

    const result = await archiveSession({sessionId: session.id, projectPath}, runtime);

    expect(result).toEqual({sessionId: session.id, projectPath});
    expect(runtime.sessionHosts.running(session.id)).toBe(false);
    expect(runtime.status.all().sessions[session.id]).toBeUndefined();
    expect(await runtime.sessions.record({sessionId: session.id})).toBeNull();
    expect(await runtime.store.find(session.id)).toMatchObject({id: session.id, archivedAt: expect.any(String)});
  });

  it("rejects an unknown session with the archive error", async () => {
    const pi = await createPiTestRuntime();
    cleanups.push(() => pi.unregister());

    await expect(archiveSession({sessionId: "missing", projectPath: pi.defaultProjectRoot}, pi.runtime)).rejects.toMatchObject({
      _tag: "ArchiveSessionError",
      message: "Session not found.",
    });
  });
});
