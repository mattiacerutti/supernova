import {describe, expect, it} from "vitest";
import {normalizePiSessionTurns} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/session-mapper";
import type {IAgentModelReference} from "@pi-desktop/contracts/sessions";

const model: IAgentModelReference = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

describe("normalizePiSessionTurns", () => {
  it("groups a user request, reasoning, tool result, and assistant response into one model-attributed turn", () => {
    const turns = normalizePiSessionTurns(
      [
        {content: [{text: "Fix the tests", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [
            {thinking: "I should inspect the failure first.", type: "thinking"},
            {text: "The tests are fixed.", type: "text"},
          ],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        },
        {content: [{text: "typecheck passed", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 3, toolName: "bash"},
      ],
      model
    );

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      id: "turn-user-1",
      model,
      status: "completed",
      userMessage: {content: "Fix the tests", id: "user-1"},
    });
    expect(turns[0]?.events).toEqual([
      {content: "I should inspect the failure first.", id: "assistant-1-reasoning", timestamp: new Date(2).toISOString(), type: "reasoning"},
      {content: "The tests are fixed.", error: undefined, id: "assistant-1", timestamp: new Date(2).toISOString(), type: "assistant"},
      {
        content: "typecheck passed",
        id: "tool-1",
        timestamp: new Date(3).toISOString(),
        tool: {name: "bash", status: "completed", summary: "Ran command"},
        type: "tool",
      },
    ]);
  });
});
