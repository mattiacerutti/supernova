import type {ModelReference, Session} from "@supernova/contracts/sessions/schemas";
import {toPiSessionSummary} from "@supernova/agent-runtime/implementations/pi/projects/pi-session-mapper";
import type {PiSessionInfo, PiSessionManager} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-session-store";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/shared/lib/turns-builder";

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
    updatedAt: latestTurn?.completedAt ?? latestTurn?.startedAt ?? summary.updatedAt,
  };
}
