import type {CustomEntry, SessionEntry} from "@earendil-works/pi-coding-agent";
import type {PiSessionManager} from "@supernova/agent-runtime/pi/sdk";

export const CHECKPOINT_CUSTOM_TYPE = "supernova.checkpoint";
export const CHECKPOINT_CURSOR_CUSTOM_TYPE = "supernova.checkpoint-cursor";
export const FORK_CUSTOM_TYPE = "supernova.fork";

export type CheckpointPhase = "before-turn" | "after-turn";

/** Whether a checkpoint boundary has durable workspace state behind it. */
export type CheckpointStatus = "captured" | "disabled" | "failed";

interface CheckpointEntryData {
  /** Unique identifier for the checkpoint, used for git restoration. */
  readonly checkpointId: string;
  /** Position of this checkpoint around a user turn. */
  readonly phase: CheckpointPhase;
  /** Coverage of this boundary. Entries written before this field existed are captured. */
  readonly status?: CheckpointStatus;
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

/** Returns whether a checkpoint boundary has a durable workspace manifest behind it. */
export function isCapturedCheckpoint(entry: CheckpointEntry): boolean {
  return (entry.data.status ?? "captured") === "captured";
}

function isCheckpointCursorEntry(entry: SessionEntry): entry is CheckpointCursorEntry {
  return isCustomEntry(entry) && entry.customType === CHECKPOINT_CURSOR_CUSTOM_TYPE;
}

/** Marks where a forked session's copied history ends and its own turns begin. */
function isForkEntry(entry: SessionEntry): boolean {
  return isCustomEntry(entry) && entry.customType === FORK_CUSTOM_TYPE;
}

/**
 * Whether a checkpoint was copied in from the session this one was forked from. Workspace snapshots stay keyed by
 * the session that captured them, so an inherited boundary has nothing to restore here. Takes entries in append
 * order, where everything before the fork marker is copied history.
 */
export function isInheritedCheckpoint(entries: readonly SessionEntry[], target: CheckpointEntry): boolean {
  const forkIndex = entries.findIndex(isForkEntry);
  return forkIndex !== -1 && entries.findIndex((entry) => entry.id === target.id) < forkIndex;
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
