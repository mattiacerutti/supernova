import {Effect, Fiber, Stream} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {SessionsService} from "@supernova/agent-runtime/services/sessions/sessions-service";
import type {SendMessageEvent} from "@supernova/contracts/sessions/procedures";
import {
  createPiTestRuntime,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  imageAttachment,
  selectedModelReference,
  waitUntil,
} from "@tests/implementations/pi/sessions/pi-session-test-utils";

describe("sending messages through Pi sessions", () => {
  const runtimes: Array<{unregister: () => void}> = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
  });

  it("streams ready history, the live turn, and the final session snapshot", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession();
    pi.appendConversation(manager);
    pi.faux.setResponses([fauxAssistantMessage([fauxThinking("Checking the workspace"), fauxText("Done.")])]);

    const events = await pi.sendMessage({message: "Fix it", model: selectedModelReference, sessionId: info.id});

    expect(manager.buildSessionContext()).toMatchObject({model: {modelId: "claude-sonnet", provider: "anthropic"}, thinkingLevel: "high"});
    expect(events[0]).toMatchObject({
      turns: [{events: [{content: "Existing response", type: "assistant"}], userMessage: {contentParts: [{text: "Existing request", type: "text"}]}}],
      type: "ready",
    });
    expect(events.find((event) => event.type === "turn")).toMatchObject({
      turn: {status: "streaming", userMessage: {contentParts: [{text: "Fix it", type: "text"}]}},
      type: "turn",
    });
    expect(events.at(-1)).toMatchObject({
      turns: [
        {events: [{content: "Existing response", type: "assistant"}], userMessage: {contentParts: [{text: "Existing request", type: "text"}]}},
        {
          events: [
            {content: "Checking the workspace", type: "reasoning"},
            {content: "Done.", type: "assistant"},
          ],
          userMessage: {contentParts: [{text: "Fix it", type: "text"}]},
        },
      ],
      type: "done",
    });
  });

  it("sends authored text and images to the provider while displaying authored content parts", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession();
    const contentParts = [
      {text: "Review ", type: "text" as const},
      {id: "ref-1", kind: "file" as const, name: "file.ts", type: "reference" as const, value: "@src/file.ts"},
      imageAttachment,
    ];
    let providerUserContent: unknown;
    pi.faux.setResponses([
      (context) => {
        providerUserContent = context.messages.find((message) => message.role === "user")?.content;
        return fauxAssistantMessage("Reviewed.");
      },
    ]);

    const events = await pi.sendMessage({contentParts, model: selectedModelReference, sessionId: info.id});

    expect(providerUserContent).toEqual([
      {text: "Review @src/file.ts", type: "text"},
      {data: "aW1hZ2UtYnl0ZXM=", mimeType: "image/png", type: "image"},
    ]);
    expect(events.at(-1)).toMatchObject({
      turns: [
        {
          events: [{content: "Reviewed.", type: "assistant"}],
          userMessage: {
            contentParts: [
              {text: "Review ", type: "text"},
              {id: "ref-1", kind: "file", value: "@src/file.ts"},
              {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1"},
            ],
          },
        },
      ],
      type: "done",
    });
  });

  it("emits an error when the selected model is unavailable", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession();

    const events = await pi.sendMessage({message: "Fix it", model: {...selectedModelReference, id: "missing-model"}, sessionId: info.id});

    expect(events).toEqual([{error: "Selected model is not available.", type: "error"}]);
    expect(pi.faux.state.callCount).toBe(0);
  });

  it("emits an error when the session cannot be found", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);

    const events = await pi.sendMessage({message: "Fix it", model: selectedModelReference, sessionId: "missing-session"});

    expect(events).toEqual([{error: "Session not found.", type: "error"}]);
    expect(pi.faux.state.callCount).toBe(0);
  });

  it("aborts the active provider request when the stream is interrupted", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info} = pi.createSession();
    let providerSignal: AbortSignal | undefined;
    let releaseProvider: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      pi.faux.setResponses([
        async (_context, options) => {
          providerSignal = options?.signal;
          resolve();
          await new Promise<void>((release) => {
            releaseProvider = release;
          });
          return fauxAssistantMessage("Done.");
        },
      ]);
    });
    const events: SendMessageEvent[] = [];
    const program = Effect.gen(function* () {
      const sessions = yield* SessionsService;
      yield* Stream.runForEach(sessions.sendMessage({contentParts: [{text: "Fix it", type: "text"}], model: selectedModelReference, sessionId: info.id}), (event) =>
        Effect.sync(() => events.push(event))
      );
    }).pipe(Effect.provide(pi.sessionsLive));

    const fiber = Effect.runFork(program);
    await providerStarted;
    await waitUntil(() => expect(events[0]).toMatchObject({type: "ready"}));
    const interrupt = Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.ignore));
    await waitUntil(() => expect(providerSignal?.aborted).toBe(true));
    releaseProvider?.();
    await interrupt;

    expect(events[0]).toMatchObject({type: "ready"});
    expect(providerSignal?.aborted).toBe(true);
  });
});
