import {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import type {SessionEntry} from "@earendil-works/pi-coding-agent";
import {
  isCheckpointAfterTurnEntry,
  isCheckpointEntry,
  latestCheckpointCursor,
} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-entries";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

function findRedoTarget(branch: readonly SessionEntry[], currentIndex: number) {
  const nextUserOffset = branch.slice(currentIndex + 1).findIndex((entry) => entry.type === "message" && entry.message.role === "user");
  if (nextUserOffset === -1) return undefined;

  return branch.slice(currentIndex + nextUserOffset + 2).find(isCheckpointAfterTurnEntry);
}

/** Moves the session and workspace forward along the most recently undone path. */
export async function redoCheckpoint(runtime: PiSessionRuntime): Promise<void> {
  runtime.beginWork();
  try {
    const sessionManager = await runtime.getSessionManager();
    const cursor = latestCheckpointCursor(sessionManager.getEntries());

    if (!cursor || cursor.nodeEntryId === cursor.leafEntryId) throw new Error("No checkpoint is available to redo.");

    const branch = sessionManager.getBranch(cursor.leafEntryId);
    const nodeIndex = branch.findIndex((entry) => entry.id === cursor.nodeEntryId);
    if (nodeIndex === -1) throw new Error("No checkpoint is available to redo.");

    const current = branch[nodeIndex];
    if (!current || !isCheckpointEntry(current)) throw new Error("No checkpoint is available to redo.");

    const target = findRedoTarget(branch, nodeIndex);
    if (!target) throw new Error("No checkpoint is available to redo.");

    await runtime.navigateToCheckpoint(target, current, cursor.leafEntryId);
  } catch (cause) {
    throw new CheckpointNavigationError({cause, message: cause instanceof Error ? cause.message : "Failed to redo checkpoint."});
  } finally {
    runtime.endWork();
  }
}
