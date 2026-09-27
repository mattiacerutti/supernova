import type {CompactSessionPayload} from "@supernova/contracts/session-runtime/procedures";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

/** Manually compacts the session context without submitting a user turn. */
export async function compactSession(runtime: SessionWorker, input: CompactSessionPayload): Promise<void> {
  runtime.beginWork();

  try {
    await runtime.selectModel(input.modelReference);

    runtime.publishEvent({type: "session.compaction.started", sessionId: runtime.sessionId});
    await runtime.compactActiveSession();
    runtime.publishEvent({type: "session.compaction.ended", sessionId: runtime.sessionId});
    await runtime.publishSessionSnapshot();
  } catch (cause) {
    runtime.publishEvent({type: "session.compaction.ended", sessionId: runtime.sessionId});
    runtime.publishEvent({
      type: "session.error",
      sessionId: runtime.sessionId,
      error: cause instanceof Error ? cause.message : "Failed to compact session.",
    });
  } finally {
    runtime.endWork();
  }
}
