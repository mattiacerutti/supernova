import type {UndoCheckpointPayload} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import {isCheckpointEntry, latestCheckpointCursor, navigateToCheckpoint} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";
import type {CheckpointEntry} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

//NOTE: Pi sessions are append-only trees. `getBranch()` walks from the
// current leaf back to the root. After checkpoint navigation we branch to the
// restored checkpoint entry, then append a checkpoint-cursor entry under it.
// That cursor becomes the current leaf, so the default branch remains aligned
// with the persisted cursor state across reloads.

/** Moves the session and workspace back to the previous checkpoint. */
export async function undoCheckpoint(runtime: PiSessionRuntime, input: UndoCheckpointPayload): Promise<void> {
  runtime.beginWork();
  try {
    const openedSession = await runtime.openSession(input.sessionId);
    const checkpoints: CheckpointEntry[] = [];

    for (const entry of openedSession.sessionManager.getBranch().toReversed()) {
      if (!isCheckpointEntry(entry)) continue;

      checkpoints.push(entry);
      if (checkpoints.length === 2) break;
    }

    const [current, target] = checkpoints;
    if (!current || !target) throw new Error("No checkpoint is available to undo.");

    const cursor = latestCheckpointCursor(openedSession.sessionManager.getEntries());
    if (!cursor) throw new Error("Checkpoint cursor was not found.");

    await navigateToCheckpoint(runtime, openedSession, {current, cursorLeafEntryId: cursor.leafEntryId, target});
  } catch (cause) {
    throw new CheckpointNavigationError({cause, message: cause instanceof Error ? cause.message : "Failed to undo checkpoint."});
  } finally {
    runtime.endWork();
  }
}
