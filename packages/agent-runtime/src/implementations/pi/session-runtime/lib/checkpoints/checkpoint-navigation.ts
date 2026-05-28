import type {CustomEntry, SessionEntry} from "@earendil-works/pi-coding-agent";

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

function isCustomEntry(entry: SessionEntry): entry is CustomEntry {
  return entry.type === "custom";
}

export function isCheckpointEntry(entry: SessionEntry): entry is CheckpointEntry {
  return isCustomEntry(entry) && entry.customType === CHECKPOINT_CUSTOM_TYPE;
}

export function isCheckpointCursorEntry(entry: SessionEntry): entry is CheckpointCursorEntry {
  return isCustomEntry(entry) && entry.customType === CHECKPOINT_CURSOR_CUSTOM_TYPE;
}

/** Returns the latest persisted checkpoint cursor. */
export function latestCheckpointCursor(entries: readonly SessionEntry[]): (CheckpointCursorEntryData & {readonly nodeEntryId: string}) | undefined {
  const entry = entries.toReversed().find(isCheckpointCursorEntry);

  if (!entry) return undefined;
  if (!entry.parentId) throw new Error("Invalid checkpoint cursor entry: missing parentId referencing the checkpoint entry.");

  return {leafEntryId: entry.data.leafEntryId, nodeEntryId: entry.parentId};
}
