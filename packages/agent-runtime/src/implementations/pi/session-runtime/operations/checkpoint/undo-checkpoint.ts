import type {UndoCheckpointPayload} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import {
  CHECKPOINT_CURSOR_CUSTOM_TYPE,
  isCheckpointEntry,
  latestCheckpointCursor,
} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/checkpoints/checkpoint-navigation";
import type {CheckpointEntry} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/checkpoints/checkpoint-navigation";
import {PiSessionRuntime} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-runtime";

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
    const branch = openedSession.sessionManager.getBranch();
    const checkpoints: CheckpointEntry[] = [];

    for (const entry of branch.toReversed()) {
      if (!isCheckpointEntry(entry)) continue;

      checkpoints.push(entry);
      if (checkpoints.length === 2) break;
    }

    const [current, previous] = checkpoints;

    if (!current || !previous) throw new Error("No checkpoint is available to undo.");

    const cursor = latestCheckpointCursor(openedSession.sessionManager.getEntries());
    if (!cursor) throw new Error("Checkpoint cursor was not found.");

    runtime.clearActiveTurn();
    await runtime.restoreCheckpoint({checkpointId: previous.data.checkpointId, cwd: openedSession.sessionInfo.cwd});

    // Sets branch to the previous checkpoint and appends a checkpoint cursor entry pointing to the restored checkpoint.
    openedSession.sessionManager.branch(previous.id);
    openedSession.sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: cursor.leafEntryId});

    await runtime.publishSessionSnapshot(openedSession);
  } catch (cause) {
    throw new CheckpointNavigationError({cause, message: cause instanceof Error ? cause.message : "Failed to undo checkpoint."});
  } finally {
    runtime.endWork();
  }
}
