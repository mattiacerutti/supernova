import type {RevertToMessagePayload} from "@supernova/contracts/services/session-runtime/procedures";
import {navigateToTurn} from "@supernova/agent-runtime/features/session-runtime/worker/lib/navigate-to-turn";
import type {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";

/** Moves the session and workspace to a turn: a visible turn is reverted inclusively, an undone one is restored. */
export async function revertToMessage(runtime: SessionWorker, input: RevertToMessagePayload): Promise<void> {
  await navigateToTurn(runtime, {
    force: input.force ?? false,
    target: ({turns, visibleCount}) => {
      const index = turns.findIndex((turn) => turn.turnId === input.turnId);
      if (index === -1) throw new Error("Checkpoint target was not found.");
      return index < visibleCount ? index : index + 1;
    },
  });
}
