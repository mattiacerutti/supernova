import type {CustomEntry, SessionEntry} from "@earendil-works/pi-coding-agent";
import type {PiSessionManager} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";

export const CHECKPOINT_CUSTOM_TYPE = "supernova.checkpoint";
export const CHECKPOINT_CURSOR_CUSTOM_TYPE = "supernova.checkpoint-cursor";

export type CheckpointPhase = "before-turn" | "after-turn";

interface CheckpointEntryData {
  /** Unique identifier for the checkpoint, used for git restoration. */
  readonly checkpointId: string;
  /** Position of this checkpoint around a user turn. */
  readonly phase: CheckpointPhase;
}

interface CheckpointCursorEntryData {
  /** Id of the current leaf checkpoint entry. */
  readonly leafEntryId: string;
}

/** Entry used to represent a restorable workspace checkpoint in the session tree. */
export type CheckpointEntry = CustomEntry<CheckpointEntryData> & {readonly data: CheckpointEntryData};

/** Entry used to track the current position in checkpoint history. */
export type CheckpointCursorEntry = CustomEntry<CheckpointCursorEntryData> & {readonly data: CheckpointCursorEntryData};

function isCustomEntry(entry: SessionEntry): entry is CustomEntry {
  return entry.type === "custom";
}

export function isCheckpointEntry(entry: SessionEntry): entry is CheckpointEntry {
  return isCustomEntry(entry) && entry.customType === CHECKPOINT_CUSTOM_TYPE;
}

export function isCheckpointAfterTurnEntry(entry: SessionEntry): entry is CheckpointEntry {
  return isCheckpointEntry(entry) && entry.data.phase === "after-turn";
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
export function invalidateCheckpointRedo(sessionManager: PiSessionManager): void {
  const cursor = latestCheckpointCursor(sessionManager.getEntries());
  if (!cursor || cursor.nodeEntryId === cursor.leafEntryId) return;

  sessionManager.branch(cursor.nodeEntryId);
  sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: cursor.nodeEntryId});
}
