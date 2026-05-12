import type {AgentSessionReasoningTurnEvent, AgentSessionTurn} from "@pi-desktop/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {upsertInterruptedTurn} from "@/features/sessions/lib/streaming/interrupted-turns";

const model = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

function reasoningEvent(id: string, second: number): AgentSessionReasoningTurnEvent {
  return {content: `reasoning ${id}`, id, timestamp: `2026-01-01T00:00:0${second}.000Z`, type: "reasoning"};
}

function turn(overrides: Partial<AgentSessionTurn>): AgentSessionTurn {
  return {
    events: [],
    id: "turn-1",
    model,
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "streaming",
    userMessage: {content: "Ship it", id: "user-1", timestamp: "2026-01-01T00:00:00.000Z"},
    ...overrides,
  };
}

describe("upsertInterruptedTurn", () => {
  it("keeps a stopped stream turn in the local transcript", () => {
    const interruptedTurn = turn({events: [reasoningEvent("reasoning-1", 1)]});

    expect(upsertInterruptedTurn([], interruptedTurn)).toMatchObject([
      {
        completedAt: "2026-01-01T00:00:01.000Z",
        events: [{id: "reasoning-1"}],
        id: "turn-1",
        status: "completed",
      },
    ]);
  });

  it("replaces an existing snapshot of the interrupted turn", () => {
    const existingTurn = turn({events: [], status: "completed"});
    const interruptedTurn = turn({events: [reasoningEvent("reasoning-1", 1)]});

    expect(upsertInterruptedTurn([existingTurn], interruptedTurn)).toHaveLength(1);
    expect(upsertInterruptedTurn([existingTurn], interruptedTurn)[0]).toMatchObject({events: [{id: "reasoning-1"}], status: "completed"});
  });
});
