import type {Turn} from "@supernova/contracts/sessions/schemas";

/** Marks a partially streamed turn complete using the best available completion timestamp. */
export function completeInterruptedTurn(turn: Turn): Turn {
  const completedAt = turn.completedAt ?? turn.events.at(-1)?.timestamp ?? new Date().toISOString();

  return {...turn, completedAt, status: "completed"};
}

/** Inserts or replaces an interrupted turn after normalizing it to completed state. */
export function upsertInterruptedTurn(turns: readonly Turn[], turn: Turn): readonly Turn[] {
  const completedTurn = completeInterruptedTurn(turn);
  const turnIndex = turns.findIndex((candidate) => candidate.id === completedTurn.id);

  if (turnIndex === -1) return [...turns, completedTurn];

  return [...turns.slice(0, turnIndex), completedTurn, ...turns.slice(turnIndex + 1)];
}
