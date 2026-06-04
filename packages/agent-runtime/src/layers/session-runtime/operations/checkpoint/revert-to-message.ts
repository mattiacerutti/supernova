import type {SessionEntry, SessionMessageEntry} from "@earendil-works/pi-coding-agent";
import type {RevertToMessagePayload} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import {isCheckpointEntry, latestCheckpointCursor, navigateToCheckpoint} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";
import type {CheckpointEntry} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

function isTargetUserEntry(entry: SessionEntry, turnId: string): entry is SessionMessageEntry {
  return entry.id === turnId && entry.type === "message" && entry.message.role === "user";
}

function findCheckpointBefore(branch: readonly SessionEntry[], index: number): CheckpointEntry | undefined {
  return branch.slice(0, index).toReversed().find(isCheckpointEntry);
}

function findCheckpointAfter(branch: readonly SessionEntry[], index: number): CheckpointEntry | undefined {
  return branch.slice(index + 1).find(isCheckpointEntry);
}

/** Moves the session and workspace to the selected committed turn. */
export async function revertToMessage(runtime: PiSessionRuntime, input: RevertToMessagePayload): Promise<void> {
  runtime.beginWork();
  try {
    const openedSession = await runtime.openSession(input.sessionId);
    const cursor = latestCheckpointCursor(openedSession.sessionManager.getEntries());
    if (!cursor) throw new Error("Checkpoint cursor was not found.");

    const branch = openedSession.sessionManager.getBranch(cursor.leafEntryId);

    // The cursor parent is the visible checkpoint. The leaf branch also includes
    // redoable turns, so comparing indexes tells us whether the target is visible
    // or currently undone.
    const nodeIndex = branch.findIndex((entry) => entry.id === cursor.nodeEntryId);
    const targetIndex = branch.findIndex((entry) => isTargetUserEntry(entry, input.turnId));

    // Visible targets are reverted inclusively, so restore the checkpoint before
    // the user message. Undone targets move forward, so restore the next checkpoint.
    const target = targetIndex <= nodeIndex ? findCheckpointBefore(branch, targetIndex) : findCheckpointAfter(branch, targetIndex);
    const current = branch[nodeIndex];

    if (nodeIndex === -1 || targetIndex === -1 || !target || !current || !isCheckpointEntry(current)) throw new Error("Checkpoint target was not found.");

    await navigateToCheckpoint(runtime, openedSession, {current, cursorLeafEntryId: cursor.leafEntryId, target});
  } catch (cause) {
    throw new CheckpointNavigationError({cause, message: cause instanceof Error ? cause.message : "Failed to revert session."});
  } finally {
    runtime.endWork();
  }
}
