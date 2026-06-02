import type {CompactSessionPayload} from "@supernova/contracts/session-runtime/procedures";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

/** Manually compacts the session context without submitting a user turn. */
export async function compactSession(runtime: PiSessionRuntime, input: CompactSessionPayload): Promise<void> {
  runtime.beginWork();

  try {
    const openedSession = await runtime.openSession(input.sessionId, input.model);

    runtime.clearActiveTurn();

    await runtime.publishEvent({type: "session.compaction.started", sessionId: runtime.sessionId});
    await runtime.compactActiveSession();
    await runtime.publishEvent({type: "session.compaction.ended", sessionId: runtime.sessionId});
    await runtime.publishSessionSnapshot(openedSession);
  } catch (cause) {
    await runtime.publishEvent({type: "session.compaction.ended", sessionId: runtime.sessionId});
    await runtime.publishEvent({
      type: "session.error",
      sessionId: runtime.sessionId,
      error: cause instanceof Error ? cause.message : "Failed to compact session.",
    });
  } finally {
    runtime.endWork();
  }
}
