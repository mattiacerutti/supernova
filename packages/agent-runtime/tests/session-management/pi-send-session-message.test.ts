import {Effect, Stream} from "effect";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {sendSessionMessage} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/send-session-message";
import type {AgentSessionStreamEvent} from "@pi-desktop/contracts/sessions";

type PiSessionEvent =
  | {assistantMessageEvent: {delta: string; type: "thinking_delta"}; message: unknown; type: "message_update"}
  | {message: unknown; type: "message_end"}
  | {toolCallId: string; toolName: string; type: "tool_execution_start"}
  | {toolCallId: string; toolName: string; type: "tool_execution_end"};

const selectedModel = {id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic", reasoning: true};
const sessionMessages: unknown[] = [];
let subscriber: ((event: PiSessionEvent) => void) | undefined;
let promptCalls = 0;

vi.mock("@mariozechner/pi-coding-agent", () => ({
  SessionManager: {
    open: () => ({}),
  },
  createAgentSession: async () => ({
    session: {
      dispose: vi.fn(),
      get messages() {
        return sessionMessages;
      },
      prompt: async (message: string) => {
        promptCalls += 1;
        const userMessage = {content: [{text: message, type: "text"}], id: "user-1", role: "user", timestamp: 1};
        const assistantMessage: {content: Array<Record<string, string>>; id: string; model: string; role: string; timestamp: number} = {
          content: [{thinking: "Checking the workspace", type: "thinking"}],
          id: "assistant-1",
          model: "claude-sonnet",
          role: "assistant",
          timestamp: 2,
        };
        sessionMessages.push(userMessage, assistantMessage);
        subscriber?.({assistantMessageEvent: {delta: "Checking the workspace", type: "thinking_delta"}, message: assistantMessage, type: "message_update"});
        subscriber?.({toolCallId: "call-1", toolName: "bash", type: "tool_execution_start"});
        subscriber?.({toolCallId: "call-1", toolName: "bash", type: "tool_execution_end"});
        assistantMessage.content = [
          {thinking: "Checking the workspace", type: "thinking"},
          {text: "Done.", type: "text"},
        ];
        subscriber?.({message: assistantMessage, type: "message_end"});
      },
      setModel: vi.fn(),
      setThinkingLevel: vi.fn(),
      subscribe: (callback: (event: PiSessionEvent) => void) => {
        subscriber = callback;
        return () => {
          subscriber = undefined;
        };
      },
    },
  }),
}));

vi.mock("@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime", () => ({
  authStorage: {},
  modelRegistry: {
    getAvailable: async () => [selectedModel],
  },
}));

vi.mock("@pi-desktop/agent-runtime/providers/pi/sessions/session-resolver", () => ({
  findSessionById: async () => ({cwd: "/workspace", id: "session-1", path: "/sessions/session-1"}),
}));

async function collectEvents(stream: Stream.Stream<AgentSessionStreamEvent>): Promise<AgentSessionStreamEvent[]> {
  const events: AgentSessionStreamEvent[] = [];
  await Effect.runPromise(Stream.runForEach(stream, (event) => Effect.sync(() => events.push(event))));
  return events;
}

describe("Pi sendSessionMessage", () => {
  beforeEach(() => {
    promptCalls = 0;
    sessionMessages.length = 0;
    subscriber = undefined;
  });

  it("streams a turn with reasoning, tool activity, and assistant response", async () => {
    const events = await collectEvents(
      sendSessionMessage({message: "Fix it", model: {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"}, sessionId: "session-1"})
    );

    expect(promptCalls).toBe(1);
    expect(events[0]).toMatchObject({turns: [], type: "ready"});
    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          events: [
            {content: "Checking the workspace", type: "reasoning"},
            {tool: {name: "bash", status: "completed", summary: "Ran command"}, type: "tool"},
            {content: "Done.", type: "assistant"},
          ],
          model: {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"},
          status: "completed",
          userMessage: {content: "Fix it", id: "user-1"},
        },
      ],
      type: "done",
    });
    expect(events.some((event) => event.type === "turn" && event.turn.status === "streaming")).toBe(true);
  });
});

//TODO: Test timestamps working and calculation, especially for reasoning
