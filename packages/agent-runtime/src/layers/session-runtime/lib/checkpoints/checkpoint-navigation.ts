import type {CustomEntry, SessionEntry} from "@earendil-works/pi-coding-agent";
import type {OpenedRuntimeSession} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";
import type {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";

export const CHECKPOINT_CUSTOM_TYPE = "supernova.checkpoint";
export const CHECKPOINT_CURSOR_CUSTOM_TYPE = "supernova.checkpoint-cursor";

interface CheckpointEntryData {
  /** Unique identifier for the checkpoint, used for git restoration. */
  readonly checkpointId: string;
}

interface CheckpointCursorEntryData {
  /** Id of the current leaf checkpoint entry. */
  readonly leafEntryId: string;
}

/** Entry used to represent a checkpoint in the session branch.
 *
 * It's always appended after a turn finishes and marks a point in the session history that can be restored to.
 * */
export type CheckpointEntry = CustomEntry<CheckpointEntryData> & {readonly data: CheckpointEntryData};
/** Entry used to track the current position in the checkpoint history for undo/redo operations.
 *
 * It's always appended after a checkpoint entry and points to the current leaf checkpoint. When navigating through checkpoints, we branch to the target checkpoint entry and update the cursor to point to it, so that the correct position in the checkpoint history is persisted across reloads.
 */
export type CheckpointCursorEntry = CustomEntry<CheckpointCursorEntryData> & {readonly data: CheckpointCursorEntryData};

export interface NavigateToCheckpointInput {
  readonly current: CheckpointEntry;
  readonly cursorLeafEntryId: string;
  readonly target: CheckpointEntry;
}

function isCustomEntry(entry: SessionEntry): entry is CustomEntry {
  return entry.type === "custom";
}

export function isCheckpointEntry(entry: SessionEntry): entry is CheckpointEntry {
  return isCustomEntry(entry) && entry.customType === CHECKPOINT_CUSTOM_TYPE;
}

function isCheckpointCursorEntry(entry: SessionEntry): entry is CheckpointCursorEntry {
  return isCustomEntry(entry) && entry.customType === CHECKPOINT_CURSOR_CUSTOM_TYPE;
}

/** Returns the latest persisted checkpoint cursor. */
export function latestCheckpointCursor(entries: readonly SessionEntry[]): (CheckpointCursorEntryData & {readonly nodeEntryId: string}) | undefined {
  const entry = entries.toReversed().find(isCheckpointCursorEntry);

  if (!entry) return undefined;
  if (!entry.parentId) throw new Error("Invalid checkpoint cursor entry: missing parentId referencing the checkpoint entry.");

  return {leafEntryId: entry.data.leafEntryId, nodeEntryId: entry.parentId};
}

/** Clears redo state by moving the latest checkpoint cursor to the currently visible checkpoint. */
export function invalidateCheckpointRedo(openedSession: OpenedRuntimeSession): void {
  const cursor = latestCheckpointCursor(openedSession.sessionManager.getEntries());
  if (!cursor || cursor.nodeEntryId === cursor.leafEntryId) return;

  openedSession.sessionManager.branch(cursor.nodeEntryId);
  openedSession.sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: cursor.nodeEntryId});
}

/** Navigates to a resolved checkpoint and updates files, branch state, agent context, and subscribers. */
export async function navigateToCheckpoint(runtime: PiSessionRuntime, openedSession: OpenedRuntimeSession, input: NavigateToCheckpointInput): Promise<void> {
  runtime.clearActiveTurn();
  await runtime.restoreCheckpoint({
    checkpointId: input.target.data.checkpointId,
    cwd: openedSession.sessionInfo.cwd,
    fromCheckpointId: input.current.data.checkpointId,
  });

  // Sets branch to the target checkpoint and appends a checkpoint cursor entry pointing to the restored checkpoint.
  openedSession.sessionManager.branch(input.target.id);
  openedSession.sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: input.cursorLeafEntryId});
  runtime.syncAgentSessionContext();

  await runtime.publishSessionSnapshot(openedSession);
}
