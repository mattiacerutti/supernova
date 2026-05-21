import type {AgentSession, SessionEntry} from "@earendil-works/pi-coding-agent";
import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect, Fiber, Layer, Stream} from "effect";
import {describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSessionInfo} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {PiSessionsLive} from "@supernova/agent-runtime/implementations/pi/sessions/pi-sessions-live";
import {SessionsService} from "@supernova/agent-runtime/services/sessions/sessions-service";
import type {SendMessagePayload, SendMessageEvent} from "@supernova/contracts/sessions/procedures";
import {collectEvents, imageAttachment, piAgentMessage, piSessionInfo, selectedPiModel, textAttachment, waitUntil} from "@tests/implementations/pi/sessions/pi-session-test-utils";

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

  const sendMessage = (
    messageInput: Omit<SendMessagePayload, "contentParts"> & {
      readonly contentParts?: SendMessagePayload["contentParts"];
      readonly message?: string;
    }
  ) =>
    Effect.gen(function* () {
      const sessions = yield* SessionsService;
      const {message, ...input} = messageInput;
      return yield* Effect.promise(() => collectEvents(sessions.sendMessage({contentParts: message ? [{text: message, type: "text"}] : [], ...input})));
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
            {tool: {kind: "command", status: "completed"}, type: "tool"},
          ],
          model: {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"},
          status: "completed",
          userMessage: {contentParts: [{text: "Fix it", type: "text"}]},
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
        contentParts: [{text: "Review this image", type: "text"}, imageAttachment],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]).toEqual({
      message: "Review this image",
      options: {images: [{data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"}]},
    });
    expect(harness.appendCustomEntry).toHaveBeenCalledWith("supernova.user-message-content-parts", {
      contentParts: [
        {text: "Review this image", type: "text"},
        {contentBase64: undefined, id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"},
      ],
    });
    expect(harness.sendCustomMessage).not.toHaveBeenCalled();
  });

  it("persists selected user message content parts without changing the Pi prompt", async () => {
    const harness = makePiSessionsHarness();
    const contentParts = [
      {text: "Read ", type: "text" as const},
      {id: "part-1", kind: "file" as const, name: "file.ts", type: "reference" as const, value: "@src/file.ts"},
    ];

    const events = await Effect.runPromise(
      harness.sendMessage({
        contentParts,
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]).toEqual({message: "Read @src/file.ts", options: undefined});
    expect(harness.appendCustomEntry).toHaveBeenCalledWith("supernova.user-message-content-parts", {contentParts});
    expect(events.at(-1)).toMatchObject({turns: [{userMessage: {contentParts}}], type: "done"});
  });

  it("appends selected skill content to the Pi prompt while displaying the authored message", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "supernova-skill-"));
    const skillDir = join(projectPath, ".agents", "skills", "demo");
    await mkdir(skillDir, {recursive: true});
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: demo skill\n---\n\nUse the word cobalt.\n");

    const harness = makePiSessionsHarness({sessions: [{...piSessionInfo, cwd: projectPath}]});
    const contentParts = [
      {text: "Use ", type: "text" as const},
      {id: "part-1", kind: "skill" as const, name: "Demo", type: "reference" as const, value: "demo"},
      {text: " please", type: "text" as const},
    ];

    const events = await Effect.runPromise(
      harness.sendMessage({
        contentParts,
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]?.message).toContain("Use demo please\n\n<skill>\n<name>demo</name>");
    expect(harness.promptCalls[0]?.message).toContain("Use the word cobalt.");
    expect(events.at(-1)).toMatchObject({turns: [{userMessage: {contentParts}}], type: "done"});
  });

  it("appends text attachments to the prompt without sending hidden custom messages", async () => {
    const harness = makePiSessionsHarness({
      prompt: async (message, context) => {
        context.messages.push(
          piAgentMessage({content: [{text: message, type: "text"}], id: "live-user", role: "user", timestamp: 1}),
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
        contentParts: [{text: "Use the notes", type: "text"}, textAttachment],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]?.message).toContain('Use the notes\n\n<attachment id="text-1"');
    expect(harness.promptCalls[0]?.message).toContain("This is a text file.");
    expect(harness.sendCustomMessage).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          userMessage: {
            contentParts: [
              {text: "Use the notes", type: "text"},
              {id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", size: 20, type: "attachment"},
            ],
          },
        },
      ],
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
        contentParts: [imageAttachment],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          events: [{content: "Reviewed attachment.", type: "assistant"}],
          userMessage: {
            contentParts: [{contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"}],
          },
        },
      ],
      type: "done",
    });
  });

  it("passes prepared content parts through ready, live, and done snapshots", async () => {
    const branch: SessionEntry[] = [
      {
        customType: "supernova.user-message-content-parts",
        data: {contentParts: [{id: "old-image", kind: "image", mime: "image/jpeg", name: "old.jpg", size: 9, type: "attachment"}]},
        id: "old-content-parts",
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
        parentId: "old-content-parts",
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
        contentParts: [{text: "New request", type: "text"}, textAttachment, imageAttachment],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );
    const turnEvent = events.find((event) => event.type === "turn");

    expect(events[0]).toMatchObject({turns: [{userMessage: {contentParts: [{contentBase64: "b2xkLWltYWdl", id: "old-image"}]}}], type: "ready"});
    expect(turnEvent).toMatchObject({
      turn: {
        status: "streaming",
        userMessage: {
          contentParts: [
            {text: "New request", type: "text"},
            {id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", size: 20, type: "attachment"},
            {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"},
          ],
        },
      },
      type: "turn",
    });
    expect(events.at(-1)).toMatchObject({
      turns: [{userMessage: {contentParts: expect.any(Array)}}, {events: [{content: "Live response", type: "assistant"}], userMessage: {contentParts: expect.any(Array)}}],
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
      turns: [{events: [{content: "Existing response", type: "assistant"}], userMessage: {contentParts: [{text: "Existing request", type: "text"}]}}],
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
        {events: [{content: "Existing response", type: "assistant"}], userMessage: {contentParts: [{text: "Existing request", type: "text"}]}},
        {events: [{content: "Live response", type: "assistant"}], userMessage: {contentParts: [{text: "New request", type: "text"}]}},
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
    const events: SendMessageEvent[] = [];

    const streamPromise = Effect.runPromise(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        yield* Stream.runForEach(
          sessions.sendMessage({
            contentParts: [{text: "Live request", type: "text"}],
            model: {id: "claude-sonnet", providerId: "anthropic"},
            sessionId: "session-1",
          }),
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
      turns: [{events: [{content: "Existing response", type: "assistant"}], userMessage: {contentParts: [{text: "Existing request", type: "text"}]}}],
      type: "ready",
    });
    expect(events.find((event) => event.type === "turn")).toMatchObject({
      turn: {
        events: [{content: "Working on it.", type: "reasoning"}],
        status: "streaming",
        userMessage: {contentParts: [{text: "Live request", type: "text"}]},
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

    expect(events.at(-1)).toMatchObject({turns: [{events: expect.any(Array), userMessage: {contentParts: [{text: "Fix it", type: "text"}]}}], type: "done"});
  });

  it("preserves attachment content-part order while using only available bytes for model context", async () => {
    const textWithoutBytes = {id: "text-empty", kind: "text" as const, mime: "text/plain", name: "empty.txt", size: 0, type: "attachment" as const};
    const imageWithoutBytes = {id: "image-empty", kind: "image" as const, mime: "image/png", name: "empty.png", size: 0, type: "attachment" as const};
    const harness = makePiSessionsHarness();

    const events = await Effect.runPromise(
      harness.sendMessage({
        contentParts: [{text: "Use supported files", type: "text"}, imageAttachment, textAttachment, textWithoutBytes, imageWithoutBytes],
        model: {id: "claude-sonnet", providerId: "anthropic"},
        sessionId: "session-1",
      })
    );

    expect(harness.promptCalls[0]?.options).toEqual({images: [{data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"}]});
    expect(harness.promptCalls[0]?.message).toContain("This is a text file.");
    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          userMessage: {
            contentParts: [
              {text: "Use supported files", type: "text"},
              {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", kind: "image", mime: "image/png", name: "diagram.png", size: 12, type: "attachment"},
              {id: "text-1", kind: "text", mime: "text/plain", name: "notes.txt", size: 20, type: "attachment"},
              {id: "text-empty", kind: "text", mime: "text/plain", name: "empty.txt", size: 0, type: "attachment"},
              {id: "image-empty", kind: "image", mime: "image/png", name: "empty.png", size: 0, type: "attachment"},
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
    const events: SendMessageEvent[] = [];

    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService;
      yield* Stream.runForEach(
        sessions.sendMessage({contentParts: [{text: "Fix it", type: "text"}], model: {id: "claude-sonnet", providerId: "anthropic"}, sessionId: "session-1"}),
        (event) => Effect.sync(() => events.push(event))
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
      customType: "supernova.user-message-content-parts",
      data: {contentParts: [{text: "Existing request", type: "text"}]},
      id: "base-content-parts",
      parentId: null,
      timestamp: "1970-01-01T00:00:00.001Z",
      type: "custom",
    },
    {
      id: "base-user",
      message: piAgentMessage({content: [{text: "Existing request", type: "text"}], id: "base-user-message", role: "user", timestamp: 1}),
      parentId: "base-content-parts",
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
