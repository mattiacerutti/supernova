import type {RedoCheckpointPayload} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import {
  CHECKPOINT_CURSOR_CUSTOM_TYPE,
  isCheckpointEntry,
  latestCheckpointCursor,
} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

/** Moves the session and workspace forward along the most recently undone path. */
export async function redoCheckpoint(runtime: PiSessionRuntime, input: RedoCheckpointPayload): Promise<void> {
  runtime.beginWork();
  try {
    const openedSession = await runtime.openSession(input.sessionId);
    const cursor = latestCheckpointCursor(openedSession.sessionManager.getEntries());

    if (!cursor || cursor.nodeEntryId === cursor.leafEntryId) throw new Error("No checkpoint is available to redo.");

    const branch = openedSession.sessionManager.getBranch(cursor.leafEntryId);
    const nodeIndex = cursor.nodeEntryId ? branch.findIndex((entry) => entry.id === cursor.nodeEntryId) : -1;
    if (nodeIndex === -1) throw new Error("No checkpoint is available to redo.");

    const current = branch[nodeIndex];
    if (!current || !isCheckpointEntry(current)) throw new Error("No checkpoint is available to redo.");

    // Find the next checkpoint entry by removing all entries up to and including the current checkpoint cursor node, then looking for the first checkpoint entry in the remaining branch.
    const target = branch.slice(nodeIndex + 1).find(isCheckpointEntry);

    if (!target) throw new Error("No checkpoint is available to redo.");

    runtime.clearActiveTurn();
    await runtime.restoreCheckpoint({checkpointId: target.data.checkpointId, cwd: openedSession.sessionInfo.cwd, fromCheckpointId: current.data.checkpointId});

    openedSession.sessionManager.branch(target.id);
    openedSession.sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: cursor.leafEntryId});

    await runtime.publishSessionSnapshot(openedSession);
  } catch (cause) {
    throw new CheckpointNavigationError({cause, message: cause instanceof Error ? cause.message : "Failed to redo checkpoint."});
  } finally {
    runtime.endWork();
  }
}
