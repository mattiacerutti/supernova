import type {RedoCheckpointPayload} from "@supernova/contracts/services/session-runtime/procedures";
import {navigateToTurn} from "@supernova/agent-runtime/features/session-runtime/worker/lib/navigate-to-turn";
import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

export async function redoCheckpoint(runtime: SessionWorker, input: RedoCheckpointPayload): Promise<void> {
  await navigateToTurn(runtime, {
    force: input.force ?? false,
    target: ({turns, visibleCount}) => {
      if (visibleCount >= turns.length) throw new Error("No checkpoint is available to redo.");
      return visibleCount + 1;
    },
  });
}
