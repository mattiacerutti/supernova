import type {UndoCheckpointPayload} from "@supernova/contracts/session-runtime/procedures";
import {isCheckpointEntry, latestCheckpointCursor} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-entries";
import type {CheckpointEntry} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-entries";
import type {SessionEntry} from "@earendil-works/pi-coding-agent";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

//NOTE: Pi sessions are append-only trees. `getBranch()` walks from the
// current leaf back to the root. After checkpoint navigation we branch to the
// restored checkpoint entry, then append a checkpoint-cursor entry under it.
// That cursor becomes the current leaf, so the default branch remains aligned
// with the persisted cursor state across reloads.

function findUndoTarget(branch: readonly SessionEntry[], currentIndex: number): CheckpointEntry | undefined {
  const targetUserIndex = branch.slice(0, currentIndex).findLastIndex((entry) => entry.type === "message" && entry.message.role === "user");
  return targetUserIndex === -1 ? undefined : branch.slice(0, targetUserIndex).toReversed().find(isCheckpointEntry);
}

/** Moves the session and workspace back to the previous checkpoint. */
export async function undoCheckpoint(runtime: PiSessionRuntime, input: UndoCheckpointPayload): Promise<void> {
  runtime.beginWork();
  try {
    const sessionManager = await runtime.getSessionManager();
    const cursor = latestCheckpointCursor(sessionManager.getEntries());
    if (!cursor) throw new Error("Checkpoint cursor was not found.");

    const branch = sessionManager.getBranch(cursor.leafEntryId);
    const currentIndex = branch.findIndex((entry) => entry.id === cursor.nodeEntryId);
    const current = branch[currentIndex];
    const target = currentIndex === -1 ? undefined : findUndoTarget(branch, currentIndex);

    if (!current || !isCheckpointEntry(current) || !target) throw new Error("No checkpoint is available to undo.");

    await runtime.navigateToCheckpoint({current, cursorLeafEntryId: cursor.leafEntryId, force: input.force ?? false, target});
  } finally {
    runtime.endWork();
  }
}
