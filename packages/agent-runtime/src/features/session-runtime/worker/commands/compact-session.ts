import type {CompactSessionPayload} from "@supernova/contracts/session-runtime/procedures";
import {findSelectedModel} from "@supernova/agent-runtime/pi/lib/models/selected-model";
import {toPiThinkingLevel} from "@supernova/agent-runtime/pi/lib/models/thinking-levels";
import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

/** Manually compacts the session context without submitting a user turn. */
export async function compactSession(runtime: SessionWorker, input: CompactSessionPayload): Promise<void> {
  const session = await runtime.beginWork();
  try {
    const model = findSelectedModel(runtime.sdk, input.modelReference);
    await session.configure({provider: model.provider, modelId: model.id, thinkingLevel: toPiThinkingLevel(input.modelReference.thinkingLevel)});
    // Its progress reaches clients through `pi.live.compactions` in the session's state.
    await session.compact();
  } catch (cause) {
    runtime.publishEvent({type: "session.error", sessionId: runtime.sessionId, error: cause instanceof Error ? cause.message : "Failed to compact session."});
  } finally {
    runtime.endWork();
  }
}
