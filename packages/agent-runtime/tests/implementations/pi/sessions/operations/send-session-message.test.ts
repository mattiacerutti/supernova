import type {AgentSession, SessionEntry} from "@mariozechner/pi-coding-agent";
import {Effect, Fiber, Layer, Stream} from "effect";
import {describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import type {PiSessionInfo} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {PiSessionsLive} from "@pi-desktop/agent-runtime/implementations/pi/sessions/pi-sessions-live";
import {SessionsService} from "@pi-desktop/agent-runtime/services/sessions/sessions-service";
import type {SessionMessageSendPayload, SessionStreamEvent} from "@pi-desktop/contracts/sessions/procedures";
import {
  collectEvents,
  imageAttachment,
  ignoredAttachment,
  piAgentMessage,
  piSessionInfo,
  selectedPiModel,
  textAttachment,
  waitUntil,
} from "@tests/implementations/pi/sessions/pi-session-test-utils";

type PiSessionEvent =
  | {readonly assistantMessageEvent: {readonly delta: string; readonly type: "thinking_delta"}; readonly message: AgentSession["messages"][number]; readonly type: "message_update"}
  | {readonly message: AgentSession["messages"][number]; readonly type: "message_end"}
  | {readonly toolCallId: string; readonly toolName: string; readonly type: "tool_execution_start"}
  | {readonly toolCallId: string; readonly toolName: string; readonly type: "tool_execution_end"};

type PiPromptHandler = (
  message: string,
  context: {
    readonly emit: (event: PiSessionEvent) => void;
    readonly messages: AgentSession["messages"];
    readonly pendingCustomMessages: AgentSession["messages"];
    readonly promptOptions: {readonly images?: readonly unknown[]} | undefined;
  }
) => Promise<void>;

function makePiSessionsHarness(input?: {
  readonly availableModels?: readonly unknown[];
  readonly branch?: readonly unknown[] | (() => readonly unknown[]);
  readonly messages?: readonly AgentSession["messages"][number][];
  readonly prompt?: PiPromptHandler;
  readonly sessions?: readonly PiSessionInfo[];
  readonly sessionName?: string;
}) {
  const abort = vi.fn(async () => undefined);
  const appendSessionInfo = vi.fn();
  const messages: AgentSession["messages"] = input?.messages ? [...input.messages] : [];
  const pendingCustomMessages: AgentSession["messages"] = [];
  const dispose = vi.fn();
  const getBranch = vi.fn(() => (typeof input?.branch === "function" ? input.branch() : (input?.branch ?? [])));
  const appendCustomEntry = vi.fn();
  const promptCalls: Array<{message: string; options: {readonly images?: readonly unknown[]} | undefined}> = [];
  const setModel = vi.fn();
  const setThinkingLevel = vi.fn();
  const sendCustomMessage = vi.fn(async (message: Record<string, unknown>, options?: {readonly deliverAs?: string}) => {
    if (options?.deliverAs === "nextTurn") pendingCustomMessages.push(piAgentMessage({...message, role: "custom", timestamp: 1.5}));
  });
  const unsubscribe = vi.fn();
  let subscriber: ((event: PiSessionEvent) => void) | undefined;

  const sessionManager = {
    appendCustomEntry,
    appendSessionInfo,
    getBranch,
    getSessionName: vi.fn(() => input?.sessionName ?? piSessionInfo.name),
  };

  const piSdk = {
    SessionManager: {
      listAll: vi.fn(async () => input?.sessions ?? [piSessionInfo]),
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
        prompt: async (message: string, promptOptions?: {readonly images?: readonly unknown[]}) => {
          promptCalls.push({message, options: promptOptions});
          if (input?.prompt) return input.prompt(message, {emit: (event) => subscriber?.(event), messages, pendingCustomMessages, promptOptions});

          const user = piAgentMessage({content: [{text: message, type: "text"}, ...(promptOptions?.images ?? [])], id: "user-1", role: "user", timestamp: 1});
          const assistant = piAgentMessage({
            content: [{thinking: "Checking the workspace", type: "thinking"}],
            id: "assistant-1",
            model: "claude-sonnet",
            role: "assistant",
            timestamp: 2,
          });

          messages.push(user, ...pendingCustomMessages, assistant);
          subscriber?.({assistantMessageEvent: {delta: "Checking the workspace", type: "thinking_delta"}, message: assistant, type: "message_update"});
          subscriber?.({toolCallId: "call-1", toolName: "bash", type: "tool_execution_start"});
          messages.push(
            piAgentMessage({
              content: [{text: "passed", type: "text"}],
              id: "tool-1",
              isError: false,
              role: "toolResult",
              timestamp: 3,
              toolCallId: "call-1",
              toolName: "bash",
            })
          );
          subscriber?.({toolCallId: "call-1", toolName: "bash", type: "tool_execution_end"});
          Object.assign(assistant, {
            content: [
              {thinking: "Checking the workspace", type: "thinking"},
              {text: "Done.", type: "text"},
            ],
          });
          subscriber?.({message: assistant, type: "message_end"});
        },
        sendCustomMessage,
        setModel,
        setThinkingLevel,
        subscribe: (callback: (event: PiSessionEvent) => void) => {
          subscriber = callback;
          return unsubscribe;
        },
      },
    })),
    modelRegistry: {
      getAvailable: vi.fn(() => input?.availableModels ?? [selectedPiModel]),
    },
  };

  const sessionsLive = PiSessionsLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk as never)));

  const sendMessage = (messageInput: Omit<SessionMessageSendPayload, "attachments"> & {readonly attachments?: SessionMessageSendPayload["attachments"]}) =>
    Effect.gen(function* () {
      const sessions = yield* SessionsService;
      return yield* Effect.promise(() => collectEvents(sessions.sendMessage({attachments: [], ...messageInput})));
    }).pipe(Effect.provide(sessionsLive));

  return {
    abort,
    appendCustomEntry,
    appendSessionInfo,
    dispose,
    getBranch,
    messages,
    pendingCustomMessages,
    piSdk,
    promptCalls,
    sendCustomMessage,
    sendMessage,
    sessionsLive,
    setModel,
    setThinkingLevel,
    unsubscribe,
  };
}

describe("sending messages through Pi sessions", () => {
  it("streams a sent message turn with reasoning, tool activity, and assistant response", async () => {
    const harness = makePiSessionsHarness();

    const events = await Effect.runPromise(
      harness.sendMessage({
        message: "Fix it",
        model: {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"},
        sessionId: "session-1",
      })
    );

    expect(harness.setModel).toHaveBeenCalledWith(selectedPiModel);
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

  it("sends image bytes as prompt images while persisting metadata without duplicated bytes", async () => {
    const harness = makePiSessionsHarness();

    await Effect.runPromise(
      harness.sendMessage({
        attachments: [imageAttachment],
        message: "Review this image",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]).toEqual({
      message: "Review this image",
      options: {images: [{data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"}]},
    });
    expect(harness.appendCustomEntry).toHaveBeenCalledWith("pi-desktop.attachments", {
      attachments: [{id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", order: 0, size: 12}],
    });
    expect(harness.appendCustomEntry.mock.calls[0]?.[1]).not.toHaveProperty("attachments.0.contentBase64");
    expect(harness.sendCustomMessage).not.toHaveBeenCalled();
  });

  it("persists selected user message content parts without changing the Pi prompt", async () => {
    const harness = makePiSessionsHarness();
    const contentParts = [
      {text: "Read ", type: "text" as const},
      {id: "part-1", kind: "file" as const, title: "file.ts", type: "reference" as const, value: "@src/file.ts"},
    ];

    const events = await Effect.runPromise(
      harness.sendMessage({
        contentParts,
        message: "Read @src/file.ts",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]).toEqual({message: "Read @src/file.ts", options: undefined});
    expect(harness.appendCustomEntry).toHaveBeenCalledWith("pi-desktop.user-message-content-parts", {contentParts});
    expect(events.at(-1)).toMatchObject({turns: [{userMessage: {content: "Read @src/file.ts", contentParts}}], type: "done"});
  });

  it("sends text attachments as hidden next-turn context without mutating user text", async () => {
    const harness = makePiSessionsHarness({
      prompt: async (message, context) => {
        context.messages.push(
          piAgentMessage({content: [{text: message, type: "text"}], id: "live-user", role: "user", timestamp: 1}),
          ...context.pendingCustomMessages,
          piAgentMessage({
            content: [{text: "Read it.", type: "text"}],
            id: "live-assistant",
            role: "assistant",
            timestamp: 2,
          })
        );
      },
    });

    const events = await Effect.runPromise(
      harness.sendMessage({
        attachments: [textAttachment],
        message: "Use the notes",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]).toEqual({message: "Use the notes", options: undefined});
    expect(harness.sendCustomMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '<attachments>\n  <attachment id="text-1" name="notes.txt" mime="text/plain" size="20">\nThis is a text file.\n  </attachment>\n</attachments>',
        customType: "pi-desktop.text-attachments",
        display: false,
      }),
      {deliverAs: "nextTurn"}
    );
    expect(events.at(-1)).toMatchObject({
      turns: [{userMessage: {attachments: [{id: "text-1", mime: "text/plain", name: "notes.txt", size: 20}], content: "Use the notes"}}],
      type: "done",
    });
  });

  it("emits attachment-only submissions as user turns", async () => {
    const harness = makePiSessionsHarness({
      prompt: async (message, context) => {
        context.messages.push(
          piAgentMessage({content: [{text: message, type: "text"}, ...(context.promptOptions?.images ?? [])], id: "live-user", role: "user", timestamp: 1}),
          ...context.pendingCustomMessages,
          piAgentMessage({content: [{text: "Reviewed attachment.", type: "text"}], id: "live-assistant", role: "assistant", timestamp: 2})
        );
      },
    });

    const events = await Effect.runPromise(
      harness.sendMessage({
        attachments: [imageAttachment],
        message: "",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          events: [{content: "Reviewed attachment.", type: "assistant"}],
          userMessage: {
            attachments: [{contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12}],
            content: "",
          },
        },
      ],
      type: "done",
    });
  });

  it("passes prepared attachment context through ready, live, and done snapshots", async () => {
    const branch: SessionEntry[] = [
      {
        customType: "pi-desktop.attachments",
        data: {attachments: [{id: "old-image", kind: "image", mime: "image/jpeg", name: "old.jpg", order: 0, size: 9}]},
        id: "old-attachments",
        parentId: null,
        timestamp: "1970-01-01T00:00:00.001Z",
        type: "custom",
      },
      {
        id: "old-user",
        message: piAgentMessage({
          content: [
            {text: "Old request", type: "text"},
            {data: "b2xkLWltYWdl", mimeType: "image/jpeg", type: "image"},
          ],
          id: "old-user-message",
          role: "user",
          timestamp: 1,
        }),
        parentId: "old-attachments",
        timestamp: "1970-01-01T00:00:00.001Z",
        type: "message",
      },
      {
        id: "old-assistant",
        message: piAgentMessage({content: [{text: "Old response", type: "text"}], id: "old-assistant-message", role: "assistant", timestamp: 2}),
        parentId: "old-user",
        timestamp: "1970-01-01T00:00:00.002Z",
        type: "message",
      },
    ];
    const harness = makePiSessionsHarness({
      branch,
      prompt: async (message, context) => {
        const user = piAgentMessage({
          content: [{text: message, type: "text"}, ...(context.promptOptions?.images ?? [])],
          id: "live-user",
          role: "user",
          timestamp: 3,
        });
        const assistant = piAgentMessage({content: [{text: "Live response", type: "text"}], id: "live-assistant", role: "assistant", timestamp: 4});
        context.messages.push(user, ...context.pendingCustomMessages, assistant);
        context.emit({assistantMessageEvent: {delta: "Live response", type: "thinking_delta"}, message: assistant, type: "message_update"});
      },
    });

    const events = await Effect.runPromise(
      harness.sendMessage({
        attachments: [textAttachment, imageAttachment],
        message: "New request",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );
    const turnEvent = events.find((event) => event.type === "turn");

    expect(events[0]).toMatchObject({turns: [{userMessage: {attachments: [{contentBase64: "b2xkLWltYWdl", id: "old-image"}], content: "Old request"}}], type: "ready"});
    expect(turnEvent).toMatchObject({
      turn: {
        status: "streaming",
        userMessage: {
          attachments: [
            {id: "text-1", mime: "text/plain", name: "notes.txt", size: 20},
            {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12},
          ],
          content: "New request",
        },
      },
      type: "turn",
    });
    expect(events.at(-1)).toMatchObject({
      turns: [{userMessage: {content: "Old request"}}, {events: [{content: "Live response", type: "assistant"}], userMessage: {content: "New request"}}],
      type: "done",
    });
  });

  it("emits ready from the stable pre-prompt branch before prompting", async () => {
    const branch = baseBranch();
    const harness = makePiSessionsHarness({
      branch,
      prompt: async (message, context) => {
        context.messages.push(piAgentMessage({content: [{text: message, type: "text"}], id: "live-user", role: "user", timestamp: 3}));
      },
    });

    const events = await Effect.runPromise(
      harness.sendMessage({
        message: "New request",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(events[0]).toMatchObject({
      turns: [{events: [{content: "Existing response", type: "assistant"}], userMessage: {content: "Existing request"}}],
      type: "ready",
    });
  });

  it("appends synthetic live messages to the stale base branch for done", async () => {
    const branch = baseBranch();
    const harness = makePiSessionsHarness({
      branch: () => branch,
      prompt: async (message, context) => {
        context.messages.push(
          piAgentMessage({content: [{text: message, type: "text"}], id: "live-user", role: "user", timestamp: 3}),
          piAgentMessage({content: [{text: "Live response", type: "text"}], id: "live-assistant", role: "assistant", timestamp: 4})
        );
      },
    });

    const events = await Effect.runPromise(
      harness.sendMessage({
        message: "New request",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(events.at(-1)).toMatchObject({
      turns: [
        {events: [{content: "Existing response", type: "assistant"}], userMessage: {content: "Existing request"}},
        {events: [{content: "Live response", type: "assistant"}], userMessage: {content: "New request"}},
      ],
      type: "done",
    });
  });

  it("streams only the active live turn while keeping base history in ready", async () => {
    const branch = baseBranch();
    let resolvePrompt: (() => void) | undefined;
    let resolveTurnSeen: (() => void) | undefined;
    const promptBlocker = new Promise<void>((resolve) => {
      resolvePrompt = resolve;
    });
    const turnSeen = new Promise<void>((resolve) => {
      resolveTurnSeen = resolve;
    });
    const harness = makePiSessionsHarness({
      branch,
      prompt: async (message, context) => {
        const user = piAgentMessage({content: [{text: message, type: "text"}], id: "live-user", role: "user", timestamp: 3});
        const assistant = piAgentMessage({content: [{thinking: "Working on it.", type: "thinking"}], id: "live-assistant", role: "assistant", timestamp: 4});

        context.messages.push(user, assistant);
        context.emit({assistantMessageEvent: {delta: "Working on it.", type: "thinking_delta"}, message: assistant, type: "message_update"});
        await promptBlocker;
      },
    });
    const events: SessionStreamEvent[] = [];

    const streamPromise = Effect.runPromise(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        yield* Stream.runForEach(
          sessions.sendMessage({attachments: [], message: "Live request", model: {id: "claude-sonnet", providerId: "anthropic"}, sessionId: "session-1"}),
          (event) =>
            Effect.sync(() => {
              events.push(event);
              if (event.type === "turn") resolveTurnSeen?.();
            })
        );
      }).pipe(Effect.provide(harness.sessionsLive))
    );

    await turnSeen;

    expect(events[0]).toMatchObject({
      turns: [{events: [{content: "Existing response", type: "assistant"}], userMessage: {content: "Existing request"}}],
      type: "ready",
    });
    expect(events.find((event) => event.type === "turn")).toMatchObject({
      turn: {
        events: [{content: "Working on it.", type: "reasoning"}],
        status: "streaming",
        userMessage: {content: "Live request"},
      },
      type: "turn",
    });
    expect(events.some((event) => event.type === "done")).toBe(false);

    resolvePrompt?.();
    await streamPromise;
    expect(events.at(-1)).toMatchObject({type: "done"});
  });

  it("emits synthetic live messages in the final turn snapshot", async () => {
    const harness = makePiSessionsHarness({
      prompt: async (message, context) => {
        const user = piAgentMessage({content: [{text: message, type: "text"}], id: "live-user", role: "user", timestamp: 1});
        const assistant = piAgentMessage({
          content: [
            {thinking: "Need to inspect first.", type: "thinking"},
            {text: "I'll run the tests.", type: "text"},
            {arguments: {command: "bun test"}, id: "call-1", name: "bash", type: "toolCall"},
          ],
          id: "live-assistant",
          role: "assistant",
          timestamp: 2,
        });
        const toolResult = piAgentMessage({
          content: [{text: "passed", type: "text"}],
          id: "live-tool",
          isError: false,
          role: "toolResult",
          timestamp: 5,
          toolCallId: "call-1",
          toolName: "bash",
        });

        context.messages.push(user, assistant, toolResult);
        context.emit({message: assistant, type: "message_end"});
      },
    });

    const events = await Effect.runPromise(
      harness.sendMessage({
        message: "Fix it",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(events.at(-1)).toMatchObject({turns: [{events: expect.any(Array), userMessage: {content: "Fix it"}}], type: "done"});
  });

  it("ignores unsupported attachments while preserving supported attachment order", async () => {
    const textWithoutBytes = {id: "text-empty", mime: "text/plain", name: "empty.txt", size: 0};
    const imageWithoutBytes = {id: "image-empty", mime: "image/png", name: "empty.png", size: 0};
    const harness = makePiSessionsHarness();

    const events = await Effect.runPromise(
      harness.sendMessage({
        attachments: [imageAttachment, ignoredAttachment, textAttachment, textWithoutBytes, imageWithoutBytes],
        message: "Use supported files",
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]?.options).toEqual({images: [{data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"}]});
    expect(harness.sendCustomMessage.mock.calls[0]?.[0]).toMatchObject({content: expect.stringContaining("This is a text file.")});
    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          userMessage: {
            attachments: [
              {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12},
              {id: "text-1", mime: "text/plain", name: "notes.txt", size: 20},
              {id: "text-empty", mime: "text/plain", name: "empty.txt", size: 0},
              {id: "image-empty", mime: "image/png", name: "empty.png", size: 0},
            ],
          },
        },
      ],
      type: "done",
    });
  });
});

describe("handling Pi message send failures", () => {
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
});

describe("cleaning up interrupted Pi message streams", () => {
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
    const events: SessionStreamEvent[] = [];

    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService;
      yield* Stream.runForEach(sessions.sendMessage({attachments: [], message: "Fix it", model: {id: "claude-sonnet", providerId: "anthropic"}, sessionId: "session-1"}), (event) =>
        Effect.sync(() => events.push(event))
      );
    }).pipe(Effect.provide(harness.sessionsLive));

    const fiber = Effect.runFork(program);
    await promptStarted;
    await waitUntil(() => expect(events.length).toBeGreaterThan(0));
    await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.ignore));

    expect(events[0]).toMatchObject({type: "ready"});
    expect(harness.abort).toHaveBeenCalledOnce();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.dispose).toHaveBeenCalledOnce();
  });
});

function baseBranch(): SessionEntry[] {
  return [
    {
      id: "base-user",
      message: piAgentMessage({content: [{text: "Existing request", type: "text"}], id: "base-user-message", role: "user", timestamp: 1}),
      parentId: null,
      timestamp: "1970-01-01T00:00:00.001Z",
      type: "message",
    },
    {
      id: "base-assistant",
      message: piAgentMessage({content: [{text: "Existing response", type: "text"}], id: "base-assistant-message", role: "assistant", timestamp: 2}),
      parentId: "base-user",
      timestamp: "1970-01-01T00:00:00.002Z",
      type: "message",
    },
  ];
}
