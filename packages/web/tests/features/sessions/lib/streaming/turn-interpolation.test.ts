import type {IAgentSessionAssistantTurnEvent, IAgentSessionToolTurnEvent, IAgentSessionTurn} from "@pi-desktop/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {interpolateStreamTurn, STREAM_FRAME_MAX_DELTA_MS} from "@/features/sessions/lib/streaming/turn-interpolation";

const model = {id: "gpt-5.1", providerId: "openai", thinkingLevel: "high"};

function assistantEvent(overrides: Partial<IAgentSessionAssistantTurnEvent>): IAgentSessionAssistantTurnEvent {
  return {
    content: "",
    id: "assistant-1",
    timestamp: "2026-01-01T00:00:01.000Z",
    type: "assistant",
    ...overrides,
  };
}

function toolEvent(overrides: Partial<IAgentSessionToolTurnEvent>): IAgentSessionToolTurnEvent {
  return {
    id: "tool-1",
    timestamp: "2026-01-01T00:00:01.000Z",
    tool: {name: "bash", status: "running", summary: "Ran command"},
    type: "tool",
    ...overrides,
  };
}

function turn(overrides: Partial<IAgentSessionTurn>): IAgentSessionTurn {
  return {
    events: [],
    id: "turn-1",
    model,
    status: "streaming",
    userMessage: {content: "Fix the tests", id: "user-1", timestamp: "2026-01-01T00:00:00.000Z"},
    ...overrides,
  };
}

describe("interpolateStreamTurn", () => {
  it("uses the first stream snapshot immediately instead of revealing it from an empty turn", () => {
    const target = turn({events: [assistantEvent({content: "The first streamed answer."})]});

    expect(interpolateStreamTurn(null, target, STREAM_FRAME_MAX_DELTA_MS)).toEqual({changed: true, done: true, turn: target});
  });

  it("reveals appended assistant text incrementally without mutating the target turn", () => {
    const current = turn({events: [assistantEvent({content: "Hel"})]});
    const target = turn({events: [assistantEvent({content: "Hello streaming world"})]});

    const result = interpolateStreamTurn(current, target, STREAM_FRAME_MAX_DELTA_MS);
    const interpolatedEvent = result.turn.events[0];
    const interpolatedContent = interpolatedEvent?.type === "assistant" ? interpolatedEvent.content : "";

    expect(result).toMatchObject({changed: true, done: false});
    expect(interpolatedEvent).toMatchObject({id: "assistant-1", type: "assistant"});
    expect(interpolatedContent.startsWith("Hel")).toBe(true);
    expect(interpolatedContent.length).toBeGreaterThan("Hel".length);
    expect(interpolatedContent.length).toBeLessThan("Hello streaming world".length);
    expect(target.events[0]).toMatchObject({content: "Hello streaming world"});
  });

  it("switches directly to the target content when the stream rewrites earlier text", () => {
    const current = turn({events: [assistantEvent({content: "Old answer"})]});
    const target = turn({events: [assistantEvent({content: "New answer"})]});

    expect(interpolateStreamTurn(current, target, STREAM_FRAME_MAX_DELTA_MS)).toEqual({changed: true, done: true, turn: target});
  });

  it("applies tool updates atomically instead of interpolating tool state", () => {
    const current = turn({events: [toolEvent({tool: {name: "bash", status: "running", summary: "Ran command"}})]});
    const target = turn({events: [toolEvent({tool: {name: "bash", output: "passed", status: "completed", summary: "Ran command"}})]});

    expect(interpolateStreamTurn(current, target, STREAM_FRAME_MAX_DELTA_MS)).toEqual({changed: true, done: true, turn: target});
  });
});
