import type {AssistantTurnEvent, CompactionTurnEvent, ReasoningTurnEvent, ToolTurnEvent, Turn} from "@supernova/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {buildSessionTimeline} from "@/features/sessions/lib/timeline/build-session-timeline";
import {formatDuration} from "@/features/sessions/lib/timeline/work-timeline-items";

const model = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

function timestamp(second: number): string {
  return `2026-01-01T00:00:${second.toString().padStart(2, "0")}.000Z`;
}

function reasoningEvent(id: string, second: number): ReasoningTurnEvent {
  return {content: `reasoning ${id}`, id, timestamp: timestamp(second), type: "reasoning"};
}

function toolEvent(id: string, second: number, kind: "command" | "file-read" = "file-read"): ToolTurnEvent {
  return {id, timestamp: timestamp(second), tool: {kind, status: "pending"}, type: "tool"};
}

function assistantEvent(id: string, second: number): AssistantTurnEvent {
  return {content: `assistant ${id}`, id, timestamp: timestamp(second), type: "assistant"};
}

function compactionEvent(id: string, second: number): CompactionTurnEvent {
  return {id, status: "completed", summary: `summary ${id}`, timestamp: timestamp(second), type: "compaction"};
}

function turn(overrides: Partial<Turn>): Turn {
  return {
    completedAt: timestamp(10),
    events: [],
    id: "turn-1",
    model,
    status: "completed",
    userMessage: {contentParts: [{text: "Ship it", type: "text"}], id: "user-1", timestamp: timestamp(0)},
    ...overrides,
  };
}

describe("buildSessionTimeline", () => {
  it("groups consecutive reasoning and tool activity into work blocks with user-facing durations", () => {
    const timeline = buildSessionTimeline({
      live: false,
      liveTurn: null,
      turns: [
        turn({
          events: [reasoningEvent("reasoning-1", 1), toolEvent("tool-1", 3, "command"), assistantEvent("assistant-1", 6), toolEvent("tool-2", 7)],
        }),
      ],
    });

    expect(timeline.liveItems).toEqual([]);
    expect(timeline.committedItems).toMatchObject([
      {message: {contentParts: [{text: "Ship it", type: "text"}]}, type: "user"},
      {collapsible: true, durationMs: 5000, events: [{type: "reasoning"}, {tool: {kind: "command"}, type: "tool"}], id: "work:turn-1:0", live: false, type: "work"},
      {event: {content: "assistant assistant-1", type: "assistant"}, live: false, type: "assistant"},
      {collapsible: true, durationMs: 3000, events: [{tool: {kind: "file-read"}, type: "tool"}], id: "work:turn-1:1", live: false, type: "work"},
    ]);
  });

  it("keeps reasoning and tool-only turns expanded when there is no assistant response", () => {
    const timeline = buildSessionTimeline({
      live: false,
      liveTurn: null,
      turns: [
        turn({
          events: [reasoningEvent("reasoning-1", 1), toolEvent("tool-1", 3, "command")],
        }),
      ],
    });

    expect(timeline.committedItems).toMatchObject([
      {message: {contentParts: [{text: "Ship it", type: "text"}]}, type: "user"},
      {collapsible: false, events: [{type: "reasoning"}, {tool: {kind: "command"}, type: "tool"}], live: false, type: "work"},
    ]);
  });

  it("marks only the active stream output and trailing work as live", () => {
    const timeline = buildSessionTimeline({
      live: true,
      liveTurn: turn({
        completedAt: undefined,
        events: [assistantEvent("assistant-1", 1), toolEvent("tool-1", 3)],
        status: "streaming",
      }),
      turns: [],
    });

    expect(timeline.committedItems).toEqual([]);
    expect(timeline.liveItems).toMatchObject([
      {type: "user"},
      {event: {id: "assistant-1"}, live: true, type: "assistant"},
      {collapsible: true, events: [{id: "tool-1"}], live: true, type: "work"},
    ]);
  });

  it("renders completed compaction summaries as timeline items", () => {
    const timeline = buildSessionTimeline({
      live: false,
      liveTurn: null,
      turns: [
        turn({
          events: [assistantEvent("assistant-1", 1), compactionEvent("compaction-1", 3), assistantEvent("assistant-2", 6)],
        }),
      ],
    });

    expect(timeline.committedItems).toMatchObject([
      {type: "user"},
      {event: {id: "assistant-1"}, type: "assistant"},
      {durationMs: 3000, event: {id: "compaction-1", summary: "summary compaction-1", type: "compaction"}, id: "compaction:compaction-1", type: "compaction"},
      {event: {id: "assistant-2"}, type: "assistant"},
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
