import type {ConversationId, EntryRecord, JsonObject} from "@earendil-works/pi-durable";
import {defineDoc, ROOT_CONVERSATION_ID} from "@earendil-works/pi-durable";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {USER_ENTRY_KIND} from "@supernova/contracts/services/chat/schemas";

export interface SessionRecord {
  readonly id: string;
  readonly projectPath: string;
  readonly worktree?: SessionWorktree;
  readonly title?: string;
  readonly forkedFrom?: string;
  readonly pinned: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CheckpointStatus = "captured" | "disabled" | "failed";

export interface CheckpointRef {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly status: CheckpointStatus;
}

export interface TurnCheckpoints {
  readonly capture: boolean;
  readonly before: CheckpointRef;
  readonly after?: CheckpointRef;
}

export type SessionState = {
  // Ends at the undo point: undo, redo and revert move to a conversation that ends there.
  conversation: ConversationId;
  /** Holds the undone turns after `conversation`'s end; `conversation` is a prefix of it. Absent when nothing is undone. */
  redoConversation?: ConversationId;
  /** Navigation's forks, by the entry they end at (`"null"`: none), so a return reuses one. */
  forks: Record<string, ConversationId>;
  /** The checkpoint the workspace matches, which the next restore starts from. */
  workspaceCheckpoint?: CheckpointRef;
  /** By the turn's user entry. Only looked up, never counted, so a stale key is harmless. */
  checkpoints: Record<string, TurnCheckpoints>;
};

/** A change to `SessionState` bumps `version`; version 1 files are rewritten when opened (`migrations/turn-entries`). */
export const SessionStateDoc = defineDoc<SessionState & JsonObject>({
  kind: "supernova.session",
  version: 2,
  scope: "session",
  initial: () => ({conversation: ROOT_CONVERSATION_ID, forks: {}, checkpoints: {}}),
  // Bounds replay without rewriting every checkpoint record on each change.
  checkpointWhen: (_value, _ops, {deltasSinceBase}) => deltasSinceBase >= 64,
});

export interface TurnPosition {
  readonly turnId: string;
  /** Absent between placing the message and recording them. */
  readonly checkpoints: TurnCheckpoints | undefined;
  readonly previousId: number | undefined;
  readonly endId: number;
}

export function turnPositions(history: readonly EntryRecord[], checkpoints: Readonly<Record<string, TurnCheckpoints>>): TurnPosition[] {
  const positions: TurnPosition[] = [];
  for (const [index, entry] of history.entries()) {
    if (entry.kind !== USER_ENTRY_KIND) continue;
    const previousId = history[index - 1]?.id;
    const last = positions.at(-1);
    if (last && previousId !== undefined) positions[positions.length - 1] = {...last, endId: previousId};
    positions.push({turnId: String(entry.id), checkpoints: checkpoints[String(entry.id)], previousId, endId: history.at(-1)?.id ?? entry.id});
  }
  return positions;
}
