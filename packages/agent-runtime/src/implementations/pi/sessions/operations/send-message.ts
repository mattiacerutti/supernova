import type {AgentSession, SessionEntry} from "@earendil-works/pi-coding-agent";
import {Effect, Queue, Stream} from "effect";
import type {SendMessagePayload, SendMessageEvent} from "@supernova/contracts/sessions/procedures";
import type {SessionSummary} from "@supernova/contracts/sessions/schemas";
import {PiAgentSessionFactory} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-agent-session-factory";
import type {PiAgentSessionFactoryShape} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-agent-session-factory";
import {PiModelCatalog} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-model-catalog";
import type {PiModel, PiModelCatalogShape} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-model-catalog";
import {PiResourceCatalog} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-resource-catalog";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-resource-catalog";
import {PiSessionStore} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-store";
import type {PiSessionInfo, PiSessionManager, PiSessionStoreShape} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-store";
import {PiSessionTitleGenerator} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-title-generator";
import type {PiSessionTitleGeneratorShape} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-session-title-generator";
import type {SendMessageContext} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/send-message-context";
import {prepareSendMessageContext} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/send-message-context";
import {createLiveBranchEntries} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/live-branch-entries";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns-builder";
import {toPiThinkingLevel} from "@supernova/agent-runtime/implementations/pi/sessions/lib/models/thinking-levels";

type PiAgentMessage = AgentSession["messages"][number];

type OpenedSession = {
  readonly sessionInfo: PiSessionInfo;
  readonly sessionManager: PiSessionManager;
  readonly model: PiModel;
  readonly titleWasGenerated: boolean;
};

type PromptContext = OpenedSession & {
  readonly baseBranch: readonly SessionEntry[];
  readonly baseMessageCount: number;
  readonly baseParentId: string | null;
  readonly messageContext: SendMessageContext;
};

/** Streams one user message through Pi and emits normalized session events. */
export function sendMessage(input: SendMessagePayload) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const agentSessionFactory = yield* PiAgentSessionFactory;
      const modelCatalog = yield* PiModelCatalog;
      const resourceCatalog = yield* PiResourceCatalog;
      const sessionStore = yield* PiSessionStore;
      const titleGenerator = yield* PiSessionTitleGenerator;

      return Stream.callback<SendMessageEvent>((queue) =>
        Effect.gen(function* () {
          const runner = new SendMessageRunner({
            agentSessionFactory,
            emit: (event) => Queue.offerUnsafe(queue, event),
            end: () => Queue.endUnsafe(queue),
            input,
            modelCatalog,
            resourceCatalog,
            sessionStore,
            titleGenerator,
          });

          yield* Effect.addFinalizer(() => Effect.promise(() => runner.release({abort: true})));
          runner.start();
        })
      );
    })
  );
}

/** Owns the lifecycle for one streamed send-message request. */
class SendMessageRunner {
  private readonly emit: (event: SendMessageEvent) => void;
  private readonly end: () => void;
  private readonly input: SendMessagePayload;
  private readonly agentSessionFactory: PiAgentSessionFactoryShape;
  private readonly modelCatalog: PiModelCatalogShape;
  private readonly resourceCatalog: PiResourceCatalogShape;
  private readonly sessionStore: PiSessionStoreShape;
  private readonly titleGenerator: PiSessionTitleGeneratorShape;
  private activeSession: AgentSession | undefined;
  private cancelled = false;
  private emittedGeneratedTitle = false;
  private releasePromise: Promise<void> | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(input: {
    agentSessionFactory: PiAgentSessionFactoryShape;
    emit: (event: SendMessageEvent) => void;
    end: () => void;
    input: SendMessagePayload;
    modelCatalog: PiModelCatalogShape;
    resourceCatalog: PiResourceCatalogShape;
    sessionStore: PiSessionStoreShape;
    titleGenerator: PiSessionTitleGeneratorShape;
  }) {
    this.agentSessionFactory = input.agentSessionFactory;
    this.emit = input.emit;
    this.end = input.end;
    this.input = input.input;
    this.modelCatalog = input.modelCatalog;
    this.resourceCatalog = input.resourceCatalog;
    this.sessionStore = input.sessionStore;
    this.titleGenerator = input.titleGenerator;
  }

  /** Starts the asynchronous send-message lifecycle without blocking stream setup. */
  start(): void {
    void this.run();
  }

  /** Releases Pi resources and optionally aborts the active generation. */
  async release(input: {abort: boolean}): Promise<void> {
    this.cancelled ||= input.abort;
    if (!this.activeSession && !this.unsubscribe) return;
    if (this.releasePromise) return this.releasePromise;

    this.releasePromise = (async () => {
      if (input.abort) await this.activeSession?.abort().catch(() => undefined);
      this.unsubscribe?.();
      this.activeSession?.dispose();
    })();

    return this.releasePromise;
  }

  /** Runs the full send-message flow and guarantees stream cleanup. */
  private async run(): Promise<void> {
    try {
      const openedSession = await this.openSession();
      const context = await this.preparePromptContext(openedSession);

      // Emits the full base branch as initial turns, so the client has full context before live updates start.
      const baseTurns = buildPiTurns(context.baseBranch, this.input.model);
      this.emit({turns: baseTurns, type: "ready"});

      this.subscribeToLiveUpdates(context);

      await this.appendCustomEntries(context);
      await this.sendPrompt(context);
    } catch (cause) {
      if (!this.cancelled) this.emit({error: cause instanceof Error ? cause.message : "Failed to send message.", type: "error"});
    } finally {
      await this.release({abort: this.cancelled});
      this.end();
    }
  }

  /** Opens the target session and ensures it has a display title. */
  private async openSession(): Promise<OpenedSession> {
    const {info: sessionInfo, manager: sessionManager} = await this.sessionStore.openSessionById(this.input.sessionId);
    this.throwIfCancelled();

    const model = this.findSelectedModel();
    const titleWasGenerated = await this.ensureSessionTitle(sessionManager, model);

    this.throwIfCancelled();
    return {model, sessionInfo, sessionManager, titleWasGenerated};
  }

  private findSelectedModel(): PiModel {
    const model = this.modelCatalog.getAvailableModels().find((candidate) => candidate.provider === this.input.model.providerId && candidate.id === this.input.model.id);
    if (!model) throw new Error("Selected model is not available.");
    return model;
  }

  /** Generates and persists a fallback title for unnamed sessions. */
  private async ensureSessionTitle(sessionManager: PiSessionManager, model: PiModel): Promise<boolean> {
    if (sessionManager.getSessionName() !== undefined) return false;

    const title = await this.titleGenerator
      .generateSessionTitle({
        contentParts: this.input.contentParts,
        model,
      })
      .catch(() => "Unknown session");

    sessionManager.appendSessionInfo(title);
    return true;
  }

  /** Creates the active Pi agent session and captures the stable branch baseline. */
  private async preparePromptContext(openedSession: OpenedSession): Promise<PromptContext> {
    const {session} = await this.agentSessionFactory.createAgentSession({
      cwd: openedSession.sessionInfo.cwd,
      sessionManager: openedSession.sessionManager,
    });
    this.activeSession = session;
    this.throwIfCancelled();

    await session.setModel(openedSession.model);
    session.setThinkingLevel(toPiThinkingLevel(this.input.model.thinkingLevel));

    const baseBranch = openedSession.sessionManager.getBranch();
    return {
      ...openedSession,
      baseBranch,
      baseMessageCount: session.messages.length,
      baseParentId: baseBranch.at(-1)?.id ?? null,
      messageContext: await prepareSendMessageContext(this.input, {projectPath: openedSession.sessionInfo.cwd, resourceCatalog: this.resourceCatalog}),
    };
  }

  private async appendCustomEntries(context: PromptContext): Promise<void> {
    for (const entry of context.messageContext.customEntries) {
      context.sessionManager.appendCustomEntry(entry.customType, entry.data);
    }
  }

  /** Subscribes to Pi live updates and emits live turns */
  private subscribeToLiveUpdates(context: PromptContext): void {
    this.unsubscribe = this.activeSession?.subscribe((event) => {
      switch (event.type) {
        case "message_update":
        case "message_end":
          const liveMessages = this.getLiveMessages(context, event.message);
          this.emitLiveTurn(context, liveMessages);
          break;
        case "tool_execution_start":
        case "tool_execution_end":
          this.emitLiveTurn(context, this.getLiveMessages(context));
          break;
      }
    });
  }

  /** Sends the prompt to Pi and emits the final normalized turn list. */
  private async sendPrompt(context: PromptContext): Promise<void> {
    try {
      const images = context.messageContext.images;
      await this.activeSession?.prompt(context.messageContext.prompt, images.length > 0 ? {images: [...images]} : undefined);

      // Even after the prompt has resolved, there may be messages that haven't been persisted yet in the session branch
      // due to the timing of updates and file writes. To ensure the final emitted turn list is complete, we capture live messages one last time and build synthetic entries for them to feed into the turns builder.
      const liveMessages = this.getLiveMessages(context);
      const syntheticEntries = this.createLiveBranchEntries(context, liveMessages);

      this.emit({turns: buildPiTurns([...context.baseBranch, ...syntheticEntries], this.input.model), type: "done"});
    } finally {
      await this.release({abort: false});
    }
  }

  /** Returns current live messages from the active session.
   * If a message is provided, ensures it's included in the output even if it hasn't been captured by the session's messages array yet, which can happen for the currently streaming message due to timing of updates and event emissions.
   */
  private getLiveMessages(context: PromptContext, message?: PiAgentMessage): readonly PiAgentMessage[] {
    const messages = this.activeSession?.messages.slice(context.baseMessageCount) ?? [];

    if (!message || messages.some((candidate) => candidate === message)) return messages;

    return [...messages, message];
  }

  /** Emits the current live branch as a single streaming turn. */
  private emitLiveTurn(context: PromptContext, messages: readonly PiAgentMessage[]): void {
    const syntheticEntries = this.createLiveBranchEntries(context, messages);
    // We assume that messages we'll always be part of one and only one turn. Therefore, synthetic branches converted
    // to turns should always have exactly one turn.
    const [turn] = buildPiTurns(syntheticEntries, this.input.model);
    if (!turn) return;

    // Turn event optionally supports appending a session summary, which allows sending updated session metadata
    // (e.g. title) to the client without needing a separate event. We take advantage of this to send the generated title as
    // soon as it's available.
    const session = this.sessionSummary(context);

    const event = {
      type: "turn",
      turn: {...turn, status: "streaming"},
      ...(session ? {session} : {}),
    } satisfies SendMessageEvent;

    this.emit(event);
  }

  // Synthetic entries creation is needed becuase, due to Pi's design, live messages have  a different shape from the
  //  persisted branch entries. Since we don't want to duplicate the logic to convert Pi messages
  // to our normalized turn format, we create synthetic entries that mirror the structure of branch entries from
  // these messages, so they can be fed into the same turns builder.
  /** Creates synthetic session entries for messages produced after the base branch snapshot. */
  private createLiveBranchEntries(context: PromptContext, messages: readonly PiAgentMessage[]): SessionEntry[] {
    return createLiveBranchEntries({
      contentPartsMetadata: {contentParts: context.messageContext.contentParts},
      messages,
      parentId: context.baseParentId,
      sessionId: context.sessionInfo.id,
    });
  }

  /** Builds a one-time session summary used to update the session's metadata. */
  private sessionSummary(context: PromptContext): SessionSummary | undefined {
    if (!context.titleWasGenerated || this.emittedGeneratedTitle) return;

    const title = context.sessionManager.getSessionName();
    if (!title) return;

    this.emittedGeneratedTitle = true;
    return {id: context.sessionInfo.id, title, updatedAt: new Date().toISOString()};
  }

  private throwIfCancelled(): void {
    if (this.cancelled) throw new Error("Stream was cancelled.");
  }
}
