import type {ConversationId, EntryRecord, JsonObject} from "@earendil-works/pi-durable";
import {defineDoc, ROOT_CONVERSATION_ID} from "@earendil-works/pi-durable";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import type {UserMessageContentPart} from "@supernova/contracts/services/chat/schemas";

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

export interface TurnRecord {
  readonly contentParts: UserMessageContentPart[];
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
  // Of `conversation` and `redoConversation`, keyed by their user entry.
  turns: Record<string, TurnRecord>;
};

/** A change to `SessionState` bumps `version` and extends `migrate`, which must return a complete value. */
export const SessionStateDoc = defineDoc<SessionState & JsonObject>({
  kind: "supernova.session",
  version: 2,
  scope: "session",
  initial: () => ({conversation: ROOT_CONVERSATION_ID, forks: {}, turns: {}}),
  // 2: navigation forks. Version 1's `leaf` is dropped, so its undone turns show again.
  migrate: (value) => {
    const {branch, current, ...rest} = value as JsonObject & {branch?: ConversationId; current?: CheckpointRef};
    delete rest.leaf;
    return {...rest, conversation: branch ?? ROOT_CONVERSATION_ID, forks: {}, ...(current === undefined ? {} : {workspaceCheckpoint: current})} as SessionState & JsonObject;
  },
  // Bounds replay without rewriting every turn record on each change.
  checkpointWhen: (_value, _ops, {deltasSinceBase}) => deltasSinceBase >= 64,
});

export interface TurnPosition {
  readonly turnId: string;
  readonly record: TurnRecord;
  readonly previousId: number | undefined;
  readonly endId: number;
}

export function turnPositions(history: readonly EntryRecord[], turns: Readonly<Record<string, TurnRecord>>): TurnPosition[] {
  const positions: TurnPosition[] = [];
  for (const [index, entry] of history.entries()) {
    const record = entry.kind === "pi.user" ? turns[String(entry.id)] : undefined;
    if (!record) continue;
    const previousId = history[index - 1]?.id;
    const last = positions.at(-1);
    if (last && previousId !== undefined) positions[positions.length - 1] = {...last, endId: previousId};
    positions.push({turnId: String(entry.id), record, previousId, endId: history.at(-1)?.id ?? entry.id});
  }
  return positions;
}
