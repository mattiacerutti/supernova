import type {IAgentSessionTurn} from "@pi-desktop/contracts/sessions";

export function completeInterruptedTurn(turn: IAgentSessionTurn): IAgentSessionTurn {
  const completedAt = turn.completedAt ?? turn.events.at(-1)?.timestamp ?? new Date().toISOString();

  return {...turn, completedAt, status: "completed"};
}

export function upsertInterruptedTurn(turns: readonly IAgentSessionTurn[], turn: IAgentSessionTurn): readonly IAgentSessionTurn[] {
  const completedTurn = completeInterruptedTurn(turn);
  const turnIndex = turns.findIndex((candidate) => candidate.id === completedTurn.id);

  if (turnIndex === -1) return [...turns, completedTurn];

  return [...turns.slice(0, turnIndex), completedTurn, ...turns.slice(turnIndex + 1)];
}
