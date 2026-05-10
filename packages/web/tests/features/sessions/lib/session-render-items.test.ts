import type {IAgentSessionAssistantTurnEvent, IAgentSessionReasoningTurnEvent, IAgentSessionToolTurnEvent, IAgentSessionTurn} from "@pi-desktop/contracts/sessions";
import {describe, expect, it} from "vitest";
import {formatDuration, turnsToRenderItems} from "@/features/sessions/lib/session-render-items";

const model = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

function timestamp(second: number): string {
  return `2026-01-01T00:00:${second.toString().padStart(2, "0")}.000Z`;
}

function reasoningEvent(id: string, second: number): IAgentSessionReasoningTurnEvent {
  return {content: `reasoning ${id}`, id, timestamp: timestamp(second), type: "reasoning"};
}

function toolEvent(id: string, second: number, name = "read"): IAgentSessionToolTurnEvent {
  return {id, timestamp: timestamp(second), tool: {name, status: "completed", summary: "Used tool"}, type: "tool"};
}

function assistantEvent(id: string, second: number): IAgentSessionAssistantTurnEvent {
  return {content: `assistant ${id}`, id, timestamp: timestamp(second), type: "assistant"};
}

function turn(overrides: Partial<IAgentSessionTurn>): IAgentSessionTurn {
  return {
    completedAt: timestamp(10),
    events: [],
    id: "turn-1",
    model,
    status: "completed",
    userMessage: {content: "Ship it", id: "user-1", timestamp: timestamp(0)},
    ...overrides,
  };
}

describe("turnsToRenderItems", () => {
  it("groups consecutive reasoning and tool activity into work blocks with user-facing durations", () => {
    const items = turnsToRenderItems(
      [
        turn({
          events: [reasoningEvent("reasoning-1", 1), toolEvent("tool-1", 3, "bash"), assistantEvent("assistant-1", 6), toolEvent("tool-2", 7)],
        }),
      ],
      false
    );

    expect(items).toMatchObject([
      {message: {content: "Ship it"}, type: "user"},
      {collapsible: true, durationMs: 5000, events: [{type: "reasoning"}, {tool: {name: "bash"}, type: "tool"}], id: "work-0", live: false, type: "work"},
      {event: {content: "assistant assistant-1", type: "assistant"}, live: false, type: "assistant"},
      {collapsible: true, durationMs: 3000, events: [{tool: {name: "read"}, type: "tool"}], id: "work-1", live: false, type: "work"},
    ]);
  });

  it("keeps reasoning and tool-only turns expanded when there is no assistant response", () => {
    const items = turnsToRenderItems(
      [
        turn({
          events: [reasoningEvent("reasoning-1", 1), toolEvent("tool-1", 3, "bash")],
        }),
      ],
      false
    );

    expect(items).toMatchObject([
      {message: {content: "Ship it"}, type: "user"},
      {collapsible: false, events: [{type: "reasoning"}, {tool: {name: "bash"}, type: "tool"}], live: false, type: "work"},
    ]);
  });

  it("marks only the active stream output and trailing work as live", () => {
    const items = turnsToRenderItems(
      [
        turn({
          completedAt: undefined,
          events: [assistantEvent("assistant-1", 1), toolEvent("tool-1", 3)],
          status: "streaming",
        }),
      ],
      true
    );

    expect(items).toMatchObject([
      {type: "user"},
      {event: {id: "assistant-1"}, live: true, type: "assistant"},
      {collapsible: true, events: [{id: "tool-1"}], live: true, type: "work"},
    ]);
  });
});

describe("formatDuration", () => {
  it("uses a stable, human-scale label for short and rounded durations", () => {
    expect(formatDuration(undefined)).toBe("a moment");
    expect(formatDuration(999)).toBe("a moment");
    expect(formatDuration(1499)).toBe("1s");
    expect(formatDuration(1500)).toBe("2s");
  });
});
