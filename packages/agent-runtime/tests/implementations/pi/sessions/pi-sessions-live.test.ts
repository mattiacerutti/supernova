import {Effect, Fiber, Layer, Stream} from "effect";
import {describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import type {PiSessionInfo} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {PiSessionsLive} from "@pi-desktop/agent-runtime/implementations/pi/sessions/pi-sessions-live";
import {SessionsService} from "@pi-desktop/agent-runtime/services/sessions/sessions-service";
import type {AgentSessionStreamEvent} from "@pi-desktop/contracts/sessions/procedures";
import type {IAgentModelReference} from "@pi-desktop/contracts/sessions/schemas";

//TODO: Refactor these tests, they are awful

type PiSessionEvent =
  | {assistantMessageEvent: {delta: string; type: "thinking_delta"}; message: unknown; type: "message_update"}
  | {message: unknown; type: "message_end"}
  | {toolCallId: string; toolName: string; type: "tool_execution_start"}
  | {toolCallId: string; toolName: string; type: "tool_execution_end"};

const selectedModel = {id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic", reasoning: true};
const sessionInfo = {
  cwd: "/workspace",
  firstMessage: "Fix it",
  id: "session-1",
  modified: new Date("2026-01-01T00:00:00.000Z"),
  name: "Fix it",
  path: "/sessions/session-1",
} as PiSessionInfo;

async function collectEvents(stream: Stream.Stream<AgentSessionStreamEvent>): Promise<AgentSessionStreamEvent[]> {
  const events: AgentSessionStreamEvent[] = [];
  await Effect.runPromise(Stream.runForEach(stream, (event) => Effect.sync(() => events.push(event))));
  return events;
}

async function waitForEvent(events: readonly AgentSessionStreamEvent[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const poll = (): void => {
      if (events.length > 0) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > 1_000) {
        reject(new Error("Timed out waiting for stream event."));
        return;
      }

      setTimeout(poll, 0);
    };

    poll();
  });
}

function makePiSessionsHarness(input?: {availableModels?: unknown[]; prompt?: (message: string) => Promise<void>; sessions?: PiSessionInfo[]; sessionName?: string}) {
  const abort = vi.fn(async () => undefined);
  const appendSessionInfo = vi.fn();
  const messages: unknown[] = [];
  const dispose = vi.fn();
  const setModel = vi.fn();
  const setThinkingLevel = vi.fn();
  const unsubscribe = vi.fn();
  let subscriber: ((event: PiSessionEvent) => void) | undefined;

  const piSdk = {
    SessionManager: {
      listAll: vi.fn(async () => input?.sessions ?? [sessionInfo]),
      open: vi.fn(() => sessionManager),
    },
    authStorage: {},
    createAgentSession: vi.fn(async () => ({
      session: {
        abort,
        dispose,
        get messages() {
          return messages;
        },
        prompt: async (message: string) => {
          if (input?.prompt) return input.prompt(message);

          const userMessage = {content: [{text: message, type: "text"}], id: "user-1", role: "user", timestamp: 1};
          const assistantMessage: {content: Array<Record<string, string>>; id: string; model: string; role: string; timestamp: number} = {
            content: [{thinking: "Checking the workspace", type: "thinking"}],
            id: "assistant-1",
            model: "claude-sonnet",
            role: "assistant",
            timestamp: 2,
          };

          messages.push(userMessage, assistantMessage);
          subscriber?.({assistantMessageEvent: {delta: "Checking the workspace", type: "thinking_delta"}, message: assistantMessage, type: "message_update"});
          subscriber?.({toolCallId: "call-1", toolName: "bash", type: "tool_execution_start"});
          messages.push({content: [{text: "passed", type: "text"}], id: "tool-1", role: "toolResult", timestamp: 3, toolName: "bash"});
          subscriber?.({toolCallId: "call-1", toolName: "bash", type: "tool_execution_end"});
          assistantMessage.content = [
            {thinking: "Checking the workspace", type: "thinking"},
            {text: "Done.", type: "text"},
          ];
          subscriber?.({message: assistantMessage, type: "message_end"});
        },
        setModel,
        setThinkingLevel,
        subscribe: (callback: (event: PiSessionEvent) => void) => {
          subscriber = callback;
          return unsubscribe;
        },
      },
    })),
    modelRegistry: {
      getAvailable: vi.fn(() => input?.availableModels ?? [selectedModel]),
    },
  };

  const sessionManager = {
    appendSessionInfo,
    getSessionName: vi.fn(() => input?.sessionName ?? sessionInfo.name),
  };

  const sessionsLive = PiSessionsLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk as never)));

  const sendMessage = (messageInput: {message: string; model: IAgentModelReference; sessionId: string}) =>
    Effect.gen(function* () {
      const sessions = yield* SessionsService;
      return yield* Effect.promise(() => collectEvents(sessions.sendMessage(messageInput)));
    }).pipe(Effect.provide(sessionsLive));

  return {abort, appendSessionInfo, dispose, piSdk, sendMessage, sessionsLive, setModel, setThinkingLevel, unsubscribe};
}

describe("PiSessionsLive", () => {
  it("streams a sent message turn with reasoning, tool activity, and assistant response", async () => {
    const harness = makePiSessionsHarness();

    const events = await Effect.runPromise(
      harness.sendMessage({
        message: "Fix it",
        model: {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"},
        sessionId: "session-1",
      })
    );

    expect(harness.setModel).toHaveBeenCalledWith(selectedModel);
    expect(harness.setThinkingLevel).toHaveBeenCalledWith("high");
    expect(events[0]).toMatchObject({turns: [], type: "ready"});
    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          events: [
            {content: "Checking the workspace", type: "reasoning"},
            {content: "Done.", type: "assistant"},
            {tool: {name: "bash", status: "completed", summary: "Ran command"}, type: "tool"},
          ],
          model: {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"},
          status: "completed",
          userMessage: {content: "Fix it"},
        },
      ],
      type: "done",
    });
    expect(events.some((event) => event.type === "turn" && event.turn.status === "streaming")).toBe(true);
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.dispose).toHaveBeenCalledOnce();
  });

  it("emits a stream error when the selected model is unavailable", async () => {
    const harness = makePiSessionsHarness({availableModels: []});

    const events = await Effect.runPromise(
      harness.sendMessage({
        message: "Fix it",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(events).toEqual([{error: "Selected model is not available.", type: "error"}]);
    expect(harness.dispose).not.toHaveBeenCalled();
  });

  it("emits a stream error when the session does not exist", async () => {
    const harness = makePiSessionsHarness({sessions: []});

    const events = await Effect.runPromise(
      harness.sendMessage({
        message: "Fix it",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "missing-session",
      })
    );

    expect(events).toEqual([{error: "Session not found.", type: "error"}]);
    expect(harness.piSdk.createAgentSession).not.toHaveBeenCalled();
  });

  it("aborts and disposes the active session when stream consumption is interrupted", async () => {
    let resolvePromptStarted: (() => void) | undefined;
    const promptStarted = new Promise<void>((resolve) => {
      resolvePromptStarted = resolve;
    });
    const promptBlocker = new Promise<void>(() => undefined);
    const harness = makePiSessionsHarness({
      prompt: async () => {
        resolvePromptStarted?.();
        await promptBlocker;
      },
    });
    const events: AgentSessionStreamEvent[] = [];

    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService;
      yield* Stream.runForEach(sessions.sendMessage({message: "Fix it", model: {id: "claude-sonnet", providerId: "anthropic"}, sessionId: "session-1"}), (event) =>
        Effect.sync(() => events.push(event))
      );
    }).pipe(Effect.provide(harness.sessionsLive));

    const fiber = Effect.runFork(program);
    await promptStarted;
    await waitForEvent(events);
    await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.ignore));

    expect(events[0]).toMatchObject({type: "ready"});
    expect(harness.abort).toHaveBeenCalledOnce();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.dispose).toHaveBeenCalledOnce();
  });
});
