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
    modelReference: model,
    status: "completed",
    userMessage: {contentParts: [{text: "Ship it", type: "text"}], id: "user-1", timestamp: timestamp(0)},
    ...overrides,
  };
}

describe("buildSessionTimeline", () => {
  it("folds a settled turn's activity behind one work row before the final response", () => {
    const timeline = buildSessionTimeline({
      live: false,
      liveTurn: null,
      turns: [
        turn({
          events: [reasoningEvent("reasoning-1", 1), toolEvent("tool-1", 3, "command"), assistantEvent("assistant-1", 6), toolEvent("tool-2", 7), assistantEvent("assistant-2", 9)],
          startedAt: timestamp(0),
        }),
      ],
    });

    expect(timeline.liveItems).toEqual([]);
    expect(timeline.committedItems).toMatchObject([
      {message: {contentParts: [{text: "Ship it", type: "text"}]}, type: "user"},
      {
        durationMs: 9000,
        id: "turn-work:turn-1",
        items: [
          {event: {id: "reasoning-1"}, live: false, type: "reasoning"},
          {events: [{tool: {kind: "command"}, type: "tool"}], id: "work:turn-1:0", live: false, type: "work"},
          {event: {id: "assistant-1"}, final: false, type: "assistant"},
          {events: [{tool: {kind: "file-read"}, type: "tool"}], id: "work:turn-1:1", live: false, type: "work"},
        ],
        type: "turn-work",
      },
      {event: {id: "assistant-2"}, final: true, live: false, type: "assistant"},
    ]);
  });

  it("folds trailing work into the turn's work row when a response ends the turn", () => {
    const timeline = buildSessionTimeline({
      live: false,
      liveTurn: null,
      turns: [turn({events: [toolEvent("tool-1", 1), assistantEvent("assistant-1", 2), toolEvent("tool-2", 3), assistantEvent("assistant-2", 4)]})],
    });
    expect(timeline.committedItems).toMatchObject([
      {type: "user"},
      {items: [{type: "work"}, {event: {id: "assistant-1"}, final: false, type: "assistant"}, {type: "work"}], type: "turn-work"},
      {event: {id: "assistant-2"}, final: true, spacing: "message", type: "assistant"},
    ]);
  });

  it("keeps a settled turn flat and stamps its last item when it ends on work", () => {
    const direct = buildSessionTimeline({live: false, liveTurn: null, turns: [turn({events: [assistantEvent("assistant-1", 1)]})]});
    expect(direct.committedItems).toMatchObject([{type: "user"}, {event: {id: "assistant-1"}, final: true, type: "assistant"}]);

    const endsOnWork = buildSessionTimeline({live: false, liveTurn: null, turns: [turn({events: [assistantEvent("assistant-1", 1), toolEvent("tool-1", 3, "command")]})]});
    expect(endsOnWork.committedItems).toMatchObject([
      {type: "user"},
      {event: {id: "assistant-1"}, final: false, spacing: "work", type: "assistant"},
      {events: [{tool: {kind: "command"}}], final: true, spacing: "work", type: "work"},
    ]);

    const toolsOnly = buildSessionTimeline({live: false, liveTurn: null, turns: [turn({events: [reasoningEvent("reasoning-1", 1), toolEvent("tool-1", 3, "command")]})]});
    expect(toolsOnly.committedItems).toMatchObject([{type: "user"}, {event: {id: "reasoning-1"}, final: false, type: "reasoning"}, {final: true, type: "work"}]);
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
      {event: {id: "assistant-1"}, final: false, live: true, type: "assistant"},
      {events: [{id: "tool-1"}], final: false, live: true, type: "work"},
    ]);
    const withReasoning = buildSessionTimeline({
      live: true,
      liveTurn: turn({completedAt: undefined, events: [toolEvent("tool-1", 1), reasoningEvent("reasoning-1", 2), toolEvent("tool-2", 3)], status: "streaming"}),
      turns: [],
    });
    expect(withReasoning.liveItems).toMatchObject([
      {type: "user"},
      {events: [{id: "tool-1"}], type: "work"},
      {event: {id: "reasoning-1"}, live: true, type: "reasoning"},
      {events: [{id: "tool-2"}], live: true, type: "work"},
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
      {
        items: [
          {event: {id: "assistant-1"}, type: "assistant"},
          {durationMs: 3000, event: {id: "compaction-1", summary: "summary compaction-1", type: "compaction"}, id: "compaction:compaction-1", type: "compaction"},
        ],
        type: "turn-work",
      },
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
    expect(formatDuration(300_000)).toBe("5m");
    expect(formatDuration(3_723_000)).toBe("1h 2m 3s");
  });
});
