import type {EntryRecord, JsonObject} from "@earendil-works/pi-durable";
import {defineDoc} from "@earendil-works/pi-durable";
import type {SessionWorktree, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";

/** What Supernova knows about a session without opening its file: one row of the session catalog. */
export interface SessionRecord {
  readonly id: string;
  /** The project the session is listed under; the agent runs in `worktree.path` when set. */
  readonly projectPath: string;
  readonly worktree?: SessionWorktree;
  readonly title?: string;
  readonly forkedFrom?: string;
  /** Pinned sessions list first in their project. */
  readonly pinned: boolean;
  /** Set when archived: the session leaves its project's listing; its file stays. */
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

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

/** Navigation and turn state of one session file. */
export type SessionState = {
  /** Conversation of the current branch: every turn, undone ones included. */
  branch: number;
  /** Last shown entry of the branch: absent when at its end, null when nothing is shown. The next send forks here. */
  leaf?: number | null;
  current?: CheckpointRef;
  turns: Record<string, TurnRecord>;
};

export const SessionStateDoc = defineDoc<SessionState & JsonObject>({
  kind: "supernova.session",
  version: 1,
  scope: "session",
  initial: () => ({branch: 1, turns: {}}),
});

/** One user turn of a session's branch history, as navigation sees it. */
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
