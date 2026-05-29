import type {SessionEntry, SessionMessageEntry} from "@earendil-works/pi-coding-agent";
import type {RevertToMessagePayload} from "@supernova/contracts/session-runtime/procedures";
import {
  CHECKPOINT_CURSOR_CUSTOM_TYPE,
  isCheckpointEntry,
  latestCheckpointCursor,
} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/checkpoints/checkpoint-navigation";
import type {CheckpointEntry} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/checkpoints/checkpoint-navigation";
import {PiSessionRuntime} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-runtime";

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
    const nodeIndex = cursor.nodeEntryId ? branch.findIndex((entry) => entry.id === cursor.nodeEntryId) : -1;
    const targetIndex = branch.findIndex((entry) => isTargetUserEntry(entry, input.turnId));

    // Visible targets are reverted inclusively, so restore the checkpoint before
    // the user message. Undone targets move forward, so restore the next checkpoint.
    const target = targetIndex <= nodeIndex ? findCheckpointBefore(branch, targetIndex) : findCheckpointAfter(branch, targetIndex);

    if (nodeIndex === -1 || targetIndex === -1 || !target) throw new Error("Checkpoint target was not found.");

    runtime.clearActiveTurn();
    await runtime.restoreCheckpoint({checkpointId: target.data.checkpointId, cwd: openedSession.sessionInfo.cwd});

    openedSession.sessionManager.branch(target.id);
    openedSession.sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: cursor.leafEntryId});

    await runtime.publishSessionSnapshot(openedSession);
  } catch (cause) {
    await runtime.publishEvent({type: "session.error", sessionId: runtime.sessionId, error: cause instanceof Error ? cause.message : "Failed to revert session."});
  } finally {
    runtime.endWork();
  }
}
