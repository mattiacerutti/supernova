import {describe, expect, it} from "vitest";
import {ActiveTurn} from "@supernova/agent-runtime/layers/session-runtime/lib/turns/active-turn";
import type {PiSessionManager} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import type {SendMessageContext} from "@supernova/agent-runtime/layers/session-runtime/lib/user-message/send-message-context";
import type {Tool, ToolTurnEvent} from "@supernova/contracts/sessions/schemas";
import {piAgentMessage, selectedModelReference} from "@tests/support/layers/pi-session-test-utils";

function createActiveTurn(): ActiveTurn {
  const messageContext: SendMessageContext = {
    contentParts: [{text: "Read the file", type: "text"}],
    customEntries: [],
    images: [],
    prompt: "Read the file",
  };
  return new ActiveTurn(
    {
      baseParentId: null,
      contextWindow: 200_000,
      messageContext,
      modelReference: selectedModelReference,
    },
    {
      buildSessionContext: () => ({messages: []}),
      getBranch: () => [],
      getSessionId: () => "session-1",
    } as unknown as PiSessionManager
  );
}

function firstToolEvent(turn: ReturnType<ActiveTurn["buildLiveTurn"]>): ToolTurnEvent {
  const event = turn?.events.find((candidate) => candidate.type === "tool");
  if (!event || event.type !== "tool") throw new Error("Expected a tool event.");
  return event;
}

function toolEvents(turn: ReturnType<ActiveTurn["buildLiveTurn"]>): Tool[] {
  return turn?.events.flatMap((event) => (event.type === "tool" && event.tool ? [event.tool] : [])) ?? [];
}

describe("active turn live projection", () => {
  it("hides streamed partial tool arguments until complete arguments arrive", () => {
    const activeTurn = createActiveTurn();

    activeTurn.appendLiveMessage(
      piAgentMessage({
        content: [{arguments: {path: "file"}, id: "call-1", name: "read", type: "toolCall"}],
        role: "assistant",
        timestamp: 2,
      })
    );

    expect(firstToolEvent(activeTurn.buildLiveTurn()).tool).toEqual({kind: "file-read", status: "pending"});

    activeTurn.recordToolArguments({args: {limit: 20, path: "file-hello.tsx"}, toolCallId: "call-1"});

    expect(firstToolEvent(activeTurn.buildLiveTurn()).tool).toEqual({input: {limit: 20, path: "file-hello.tsx"}, kind: "file-read", status: "pending"});
  });

  it.each(["not-object", null, ["one.ts"]])("ignores malformed arguments %j and keeps the live tool generic", (args) => {
    const activeTurn = createActiveTurn();

    activeTurn.appendLiveMessage(
      piAgentMessage({
        content: [{arguments: {path: "partial"}, id: "call-1", name: "read", type: "toolCall"}],
        role: "assistant",
        timestamp: 2,
      })
    );

    activeTurn.recordToolArguments({args, toolCallId: "call-1"});

    expect(firstToolEvent(activeTurn.buildLiveTurn()).tool).toEqual({kind: "file-read", status: "pending"});
  });

  it.each(["pending", "toolUse", "aborted", "error"])("preserves finished inputs without revealing unfinished inputs on %s updates", (stopReason) => {
    const activeTurn = createActiveTurn();
    const message = piAgentMessage({
      content: [
        {arguments: {path: "one.ts"}, id: "call-1", name: "read", type: "toolCall"},
        {arguments: {path: "partial"}, id: "call-2", name: "read", type: "toolCall"},
      ],
      role: "assistant",
      timestamp: 2,
    });
    activeTurn.appendLiveMessage(message);
    activeTurn.recordToolArguments({args: {path: "one.ts"}, toolCallId: "call-1"});

    activeTurn.replaceLastLiveMessage(piAgentMessage({...message, stopReason}));

    expect(toolEvents(activeTurn.buildLiveTurn())).toEqual([
      {input: {path: "one.ts"}, kind: "file-read", status: "pending"},
      {kind: "file-read", status: "pending"},
    ]);
  });

  it("updates the matching assistant tool call after an earlier sequential tool result", () => {
    const activeTurn = createActiveTurn();

    activeTurn.appendLiveMessage(
      piAgentMessage({
        content: [
          {arguments: {path: "partial-one"}, id: "call-1", name: "read", type: "toolCall"},
          {arguments: {path: "partial-two"}, id: "call-2", name: "read", type: "toolCall"},
        ],
        role: "assistant",
        timestamp: 2,
      })
    );
    activeTurn.recordToolArguments({args: {path: "one.ts"}, toolCallId: "call-1"});
    activeTurn.appendLiveMessage(piAgentMessage({content: [{text: "one", type: "text"}], role: "toolResult", timestamp: 3, toolCallId: "call-1", toolName: "read"}));

    activeTurn.recordToolArguments({args: {path: "two.ts"}, toolCallId: "call-2"});

    expect(toolEvents(activeTurn.buildLiveTurn())).toMatchObject([
      {input: {path: "one.ts"}, kind: "file-read", result: {content: "one"}, status: "completed"},
      {input: {path: "two.ts"}, kind: "file-read", status: "pending"},
    ]);
  });
});
