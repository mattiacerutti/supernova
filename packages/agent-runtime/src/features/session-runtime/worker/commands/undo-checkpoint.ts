import type {UndoCheckpointPayload} from "@supernova/contracts/services/session-runtime/procedures";
import {navigateToTurn} from "@supernova/agent-runtime/features/session-runtime/worker/lib/navigate-to-turn";
import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

/** Moves the session and workspace back before the last visible turn. */
export async function undoCheckpoint(runtime: SessionWorker, input: UndoCheckpointPayload): Promise<void> {
  await navigateToTurn(runtime, {
    force: input.force ?? false,
    target: ({visibleCount}) => {
      if (visibleCount === 0) throw new Error("No checkpoint is available to undo.");
      return visibleCount - 1;
    },
  });
}
