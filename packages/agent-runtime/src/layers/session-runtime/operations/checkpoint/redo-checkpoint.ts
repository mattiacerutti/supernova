import type {RedoCheckpointPayload} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import type {SessionEntry} from "@earendil-works/pi-coding-agent";
import {isCheckpointAfterTurnEntry, isCheckpointEntry, latestCheckpointCursor, navigateToCheckpoint} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

function findRedoTarget(branch: readonly SessionEntry[], currentIndex: number) {
  const nextUserOffset = branch.slice(currentIndex + 1).findIndex((entry) => entry.type === "message" && entry.message.role === "user");
  if (nextUserOffset === -1) return undefined;

  return branch.slice(currentIndex + nextUserOffset + 2).find(isCheckpointAfterTurnEntry);
}

/** Moves the session and workspace forward along the most recently undone path. */
export async function redoCheckpoint(runtime: PiSessionRuntime, input: RedoCheckpointPayload): Promise<void> {
  runtime.beginWork();
  try {
    const openedSession = await runtime.openSession(input.sessionId);
    const cursor = latestCheckpointCursor(openedSession.sessionManager.getEntries());

    if (!cursor || cursor.nodeEntryId === cursor.leafEntryId) throw new Error("No checkpoint is available to redo.");

    const branch = openedSession.sessionManager.getBranch(cursor.leafEntryId);
    const nodeIndex = branch.findIndex((entry) => entry.id === cursor.nodeEntryId);
    if (nodeIndex === -1) throw new Error("No checkpoint is available to redo.");

    const current = branch[nodeIndex];
    if (!current || !isCheckpointEntry(current)) throw new Error("No checkpoint is available to redo.");

    const target = findRedoTarget(branch, nodeIndex);
    if (!target) throw new Error("No checkpoint is available to redo.");

    await navigateToCheckpoint(runtime, openedSession, {current, cursorLeafEntryId: cursor.leafEntryId, target});
  } catch (cause) {
    throw new CheckpointNavigationError({cause, message: cause instanceof Error ? cause.message : "Failed to redo checkpoint."});
  } finally {
    runtime.endWork();
  }
}
