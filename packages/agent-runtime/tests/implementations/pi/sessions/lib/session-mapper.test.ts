import {describe, expect, it} from "vitest";
import {normalizePiSessionTurns} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-mapper";
import type {IAgentModelReference} from "@pi-desktop/contracts/sessions";
import type {AgentSession} from "@mariozechner/pi-coding-agent";

const model: IAgentModelReference = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

function piMessages(messages: unknown[]): AgentSession["messages"] {
  return messages as AgentSession["messages"];
}

function expectTurnEvents(turn: ReturnType<typeof normalizePiSessionTurns>[number] | undefined, events: Array<Record<string, unknown>>): void {
  expect(turn?.events).toMatchObject(events);
}

describe("normalizePiSessionTurns", () => {
  it("groups a user request, reasoning, tool result, and assistant response into one model-attributed turn", () => {
    const turns = normalizePiSessionTurns(
      piMessages([
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
      ]),
      model
    );

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      id: "turn-1970-01-01T00:00:00.001Z-user-0",
      model,
      status: "completed",
      userMessage: {content: "Fix the tests", id: "1970-01-01T00:00:00.001Z-user-0"},
    });
    expectTurnEvents(turns[0], [
      {
        content: "I should inspect the failure first.",
        type: "reasoning",
      },
      {
        content: "The tests are fixed.",
        type: "assistant",
      },
      {
        tool: {name: "bash", output: "typecheck passed", status: "completed", summary: "Ran command"},
        type: "tool",
      },
    ]);
  });

  it("updates a pending tool call when it is the first event in the turn", () => {
    const turns = normalizePiSessionTurns(
      piMessages([
        {content: [{text: "Run tests", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [{arguments: {command: "bun test"}, id: "call-1", name: "bash", type: "toolCall"}],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        },
        {content: [{text: "passed", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 5, toolCallId: "call-1", toolName: "bash"},
      ]),
      model
    );

    expectTurnEvents(turns[0], [
      {
        durationMs: 3,
        tool: {input: {command: "bun test"}, name: "bash", output: "passed", status: "completed", summary: "Ran command"},
        type: "tool",
      },
    ]);
  });

  it("preserves assistant content order while replacing completed tool calls in place", () => {
    const turns = normalizePiSessionTurns(
      piMessages([
        {content: [{text: "Inspect and fix", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [
            {thinking: "I should inspect the project first.", type: "thinking"},
            {text: "I'll check the files.", type: "text"},
            {arguments: {path: "package.json"}, id: "call-1", name: "read", type: "toolCall"},
            {thinking: "Now I know what to run.", type: "thinking"},
            {arguments: {command: "bun test"}, id: "call-2", name: "bash", type: "toolCall"},
            {text: "The tests are green.", type: "text"},
          ],
          id: "assistant-1",
          role: "assistant",
          timestamp: 2,
        },
        {content: [{text: "package contents", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 3, toolCallId: "call-1", toolName: "read"},
        {content: [{text: "passed", type: "text"}], id: "tool-2", role: "toolResult", timestamp: 4, toolCallId: "call-2", toolName: "bash"},
      ]),
      model
    );

    expectTurnEvents(turns[0], [
      {content: "I should inspect the project first.", type: "reasoning"},
      {content: "I'll check the files.", type: "assistant"},
      {tool: {input: {path: "package.json"}, name: "read", output: "package contents", status: "completed"}, type: "tool"},
      {content: "Now I know what to run.", type: "reasoning"},
      {tool: {input: {command: "bun test"}, name: "bash", output: "passed", status: "completed"}, type: "tool"},
      {content: "The tests are green.", type: "assistant"},
    ]);
  });

  it("maps assistant errors into error turns", () => {
    const turns = normalizePiSessionTurns(
      piMessages([
        {content: [{text: "Fix it", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {content: [], errorMessage: "Model failed", id: "assistant-1", role: "assistant", timestamp: 2},
      ]),
      model
    );

    expect(turns[0]).toMatchObject({status: "error"});
    expectTurnEvents(turns[0], [{content: "", error: "Model failed", type: "assistant"}]);
  });

  it("does not render user-initiated aborts as assistant errors", () => {
    const turns = normalizePiSessionTurns(
      piMessages([
        {content: [{text: "Fix it", type: "text"}], id: "user-1", role: "user", timestamp: 1},
        {
          content: [{thinking: "I should inspect the project.", type: "thinking"}],
          errorMessage: "Request was aborted.",
          id: "assistant-1",
          role: "assistant",
          stopReason: "aborted",
          timestamp: 2,
        },
      ]),
      model
    );

    expect(turns[0]).toMatchObject({status: "completed"});
    expectTurnEvents(turns[0], [{content: "I should inspect the project.", type: "reasoning"}]);
  });
});
