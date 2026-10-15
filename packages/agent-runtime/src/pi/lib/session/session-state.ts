import type {EntryRecord, JsonObject} from "@earendil-works/pi-durable";
import {defineDoc} from "@earendil-works/pi-durable";
import type {SessionWorktree, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";

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
  branch: number;
  /** Last shown entry of the branch: absent when at its end, null when nothing is shown. The next send forks here. */
  leaf?: number | null;
  current?: CheckpointRef;
  turns: Record<string, TurnRecord>;
};

/** A change to `SessionState` bumps `version` and extends `migrate`, which must return a complete value. */
export const SessionStateDoc = defineDoc<SessionState & JsonObject>({
  kind: "supernova.session",
  version: 1,
  scope: "session",
  initial: () => ({branch: 1, turns: {}}),
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
