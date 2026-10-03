import type {EntryRecord, JsonObject} from "@earendil-works/pi-durable";
import {defineDoc} from "@earendil-works/pi-durable";
import type {SessionWorktree, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";

/** What Supernova knows about a session without opening its file: one entry of the session index. */
export interface SessionRecord {
  readonly id: string;
  /** The project the session is listed under; the agent runs in `worktree.path` when set. */
  readonly projectPath: string;
  readonly worktree?: SessionWorktree;
  readonly title?: string;
  readonly forkedFrom?: string;
  /** Set when archived: the session leaves its project's listing; its file stays. */
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Whether a checkpoint boundary has durable workspace state behind it. */
export type CheckpointStatus = "captured" | "disabled" | "failed";

/** One workspace checkpoint boundary. `sessionId` is the session that captured it; a fork inherits foreign ones. */
export interface CheckpointRef {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly status: CheckpointStatus;
}

/** What Supernova adds to one user turn: the authored composer content and the workspace around it. */
export interface TurnRecord {
  readonly contentParts: UserMessageContentPart[];
  /** Whether the turn captures workspace checkpoints (the composer's checkpoint toggle). */
  readonly capture: boolean;
  readonly before: CheckpointRef;
  /** Absent until the turn's run ends. */
  readonly after?: CheckpointRef;
}

/**
 * Navigation and turn state of one session file.
 *
 * `leaf` is the conversation holding every turn, including undone ones. `visible` is the conversation the user sees
 * and talks to: `leaf` itself, or a fork of it after an undo. Sending on a fork makes it the new `leaf`, which drops
 * the redo path. `current` is the checkpoint the workspace was last captured at or restored to: after a redo it is the
 * shown turn's after-checkpoint, after an undo the hidden turn's before-checkpoint, which differ when files changed
 * between turns. `turns` is keyed by the turn's user entry id. The model each turn ran with is the engine's
 * `pi.agent` document, which forks inherit as of their fork entry, so navigation restores it without our help.
 */
export type SessionState = {
  leaf: number;
  visible: number;
  current?: CheckpointRef;
  turns: Record<string, TurnRecord>;
};

export const SessionStateDoc = defineDoc<SessionState & JsonObject>({
  kind: "supernova.session",
  version: 1,
  scope: "session",
  initial: () => ({leaf: 1, visible: 1, turns: {}}),
});

/** One user turn of a session's leaf history, as navigation sees it. */
export interface TurnPosition {
  /** The user entry id; the turn's id in the timeline and the key of its record. */
  readonly turnId: string;
  readonly record: TurnRecord;
  /** The newest entry before the turn, or undefined when it is the history's first. */
  readonly previousId: number | undefined;
  /** The turn's last entry: the one before the next turn starts, or the history's last. */
  readonly endId: number;
}

/** The user turns of a history in order: user entries that have a turn record. */
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
