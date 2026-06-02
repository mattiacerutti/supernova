import type {ModelReference, Session} from "@supernova/contracts/sessions/schemas";
import {toPiSessionSummary} from "@supernova/agent-runtime/layers/projects/pi-session-mapper";
import type {PiSessionInfo, PiSessionManager} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {buildPiTurns} from "@supernova/agent-runtime/layers/shared/lib/turns-builder";
import {latestCheckpointCursor} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";

/** Builds turns hidden behind the current checkpoint cursor and available for redo. */
export function buildUndoneTurns(input: {readonly sessionManager: PiSessionManager; readonly modelReference: ModelReference}): Session["undoneTurns"] {
  const cursor = latestCheckpointCursor(input.sessionManager.getEntries());
  if (!cursor || cursor.nodeEntryId === cursor.leafEntryId) return [];

  const redoBranch = input.sessionManager.getBranch(cursor.leafEntryId);
  const nodeIndex = cursor.nodeEntryId ? redoBranch.findIndex((entry) => entry.id === cursor.nodeEntryId) : -1;
  if (nodeIndex === -1 && cursor.nodeEntryId !== null) return [];

  return buildPiTurns(redoBranch.slice(nodeIndex + 1), input.modelReference);
}

/** Builds a committed session snapshot from the current Pi branch. */
export function buildSessionSnapshot(input: {readonly sessionInfo: PiSessionInfo; readonly sessionManager: PiSessionManager; readonly modelReference: ModelReference}): Session {
  const summary = toPiSessionSummary(input.sessionInfo);
  const turns = buildPiTurns(input.sessionManager.getBranch(), input.modelReference);
  const latestTurn = turns.at(-1);

  return {
    id: input.sessionInfo.id,
    model: input.modelReference,
    projectPath: input.sessionInfo.cwd,
    title: input.sessionManager.getSessionName() ?? summary.title,
    turns,
    undoneTurns: buildUndoneTurns({sessionManager: input.sessionManager, modelReference: input.modelReference}),
    updatedAt: latestTurn?.completedAt ?? latestTurn?.startedAt ?? summary.updatedAt,
  };
}
