import type {AgentSession, SessionEntry} from "@earendil-works/pi-coding-agent";
import {Effect, Queue, Stream} from "effect";
import type {SendMessagePayload, SendMessageEvent} from "@supernova/contracts/sessions/procedures";
import type {SessionSummary} from "@supernova/contracts/sessions/schemas";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape, PiSessionInfo} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {SendMessageContext} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/send-message-context";
import {prepareSendMessageContext} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/send-message-context";
import {findSessionById} from "@supernova/agent-runtime/implementations/pi/sessions/lib/session-resolver";
import {generateSessionTitle} from "@supernova/agent-runtime/implementations/pi/sessions/lib/session-title-generator";
import {createLiveBranchEntries} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/live-branch-entries";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns-builder";
import {toPiThinkingLevel} from "@supernova/agent-runtime/implementations/pi/sessions/lib/models/thinking-levels";

type PiAgentMessage = AgentSession["messages"][number];
type PiSessionManager = ReturnType<PiSdkServiceShape["SessionManager"]["open"]>;
type PiModel = ReturnType<PiSdkServiceShape["modelRegistry"]["getAvailable"]>[number];

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
      const piSdk = yield* PiSdkService;

      return Stream.callback<SendMessageEvent>((queue) =>
        Effect.gen(function* () {
          const runner = new SendMessageRunner({
            emit: (event) => Queue.offerUnsafe(queue, event),
            end: () => Queue.endUnsafe(queue),
            input,
            piSdk,
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
  private readonly piSdk: PiSdkServiceShape;
  private activeSession: AgentSession | undefined;
  private cancelled = false;
  private emittedGeneratedTitle = false;
  private releasePromise: Promise<void> | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(input: {emit: (event: SendMessageEvent) => void; end: () => void; input: SendMessagePayload; piSdk: PiSdkServiceShape}) {
    this.emit = input.emit;
    this.end = input.end;
    this.input = input.input;
    this.piSdk = input.piSdk;
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

      this.emit({turns: buildPiTurns(context.baseBranch, this.input.model), type: "ready"});
      await this.appendUserMessageContext(context);
      this.subscribeToLiveUpdates(context);
      await this.promptAndEmitFinalTurns(context);
    } catch (cause) {
      if (!this.cancelled) this.emit({error: cause instanceof Error ? cause.message : "Failed to send message.", type: "error"});
    } finally {
      await this.release({abort: this.cancelled});
      this.end();
    }
  }

  /** Opens the target session and ensures it has a display title. */
  private async openSession(): Promise<OpenedSession> {
    const sessionInfo = await findSessionById(this.piSdk, this.input.sessionId);
    this.throwIfCancelled();

    const sessionManager = this.piSdk.SessionManager.open(sessionInfo.path);
    const model = this.findSelectedModel();
    const titleWasGenerated = await this.ensureSessionTitle(sessionManager, model);

    this.throwIfCancelled();
    return {model, sessionInfo, sessionManager, titleWasGenerated};
  }

  private findSelectedModel(): PiModel {
    const model = this.piSdk.modelRegistry.getAvailable().find((candidate) => candidate.provider === this.input.model.providerId && candidate.id === this.input.model.id);
    if (!model) throw new Error("Selected model is not available.");
    return model;
  }

  /** Generates and persists a fallback title for unnamed sessions. */
  private async ensureSessionTitle(sessionManager: PiSessionManager, model: PiModel): Promise<boolean> {
    if (sessionManager.getSessionName() !== undefined) return false;

    const title = await generateSessionTitle({
      contentParts: this.input.contentParts,
      model,
      modelRegistry: this.piSdk.modelRegistry,
    }).catch(() => "Unknown session");

    sessionManager.appendSessionInfo(title);
    return true;
  }

  /** Creates the active Pi agent session and captures the stable branch baseline. */
  private async preparePromptContext(openedSession: OpenedSession): Promise<PromptContext> {
    const {session} = await this.piSdk.createAgentSession({
      authStorage: this.piSdk.authStorage,
      cwd: openedSession.sessionInfo.cwd,
      modelRegistry: this.piSdk.modelRegistry,
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
      messageContext: await prepareSendMessageContext(this.input, {projectPath: openedSession.sessionInfo.cwd}),
    };
  }

  private async appendUserMessageContext(context: PromptContext): Promise<void> {
    for (const entry of context.messageContext.customEntries) {
      context.sessionManager.appendCustomEntry(entry.customType, entry.data);
    }
  }

  /** Subscribes to Pi live updates and emits interpolated streaming turns. */
  private subscribeToLiveUpdates(context: PromptContext): void {
    this.unsubscribe = this.activeSession?.subscribe((event) => {
      switch (event.type) {
        case "message_update":
        case "message_end":
          if ("message" in event) this.emitLiveTurn(context, this.liveMessages(context, event.message));
          break;
        case "tool_execution_start":
        case "tool_execution_end":
          this.emitLiveTurn(context, this.liveMessages(context));
          break;
      }
    });
  }

  /** Sends the prompt to Pi and emits the final normalized turn list. */
  private async promptAndEmitFinalTurns(context: PromptContext): Promise<void> {
    try {
      const images = context.messageContext.images;
      await this.activeSession?.prompt(context.messageContext.prompt, images.length > 0 ? {images: [...images]} : undefined);
      const liveEntries = this.liveBranchEntries(context, this.activeSession?.messages.slice(context.baseMessageCount) ?? []);
      this.emit({turns: buildPiTurns([...context.baseBranch, ...liveEntries], this.input.model), type: "done"});
    } finally {
      await this.release({abort: false});
    }
  }

  /** Emits the current live branch as a single streaming turn. */
  private emitLiveTurn(context: PromptContext, messages: readonly PiAgentMessage[]): void {
    const [turn] = buildPiTurns(this.liveBranchEntries(context, messages), this.input.model);
    if (!turn) return;

    const session = this.titleSummary(context);
    this.emit(session ? {session, turn: {...turn, status: "streaming"}, type: "turn"} : {turn: {...turn, status: "streaming"}, type: "turn"});
  }

  /** Returns Pi live messages, including event payload messages not yet reflected on the session. */
  private liveMessages(context: PromptContext, message?: PiAgentMessage): readonly PiAgentMessage[] {
    const messages = this.activeSession?.messages.slice(context.baseMessageCount) ?? [];
    if (!message || messages.some((candidate) => candidate === message)) return messages;
    return [...messages, message];
  }

  /** Creates transient session entries for messages produced after the base branch snapshot. */
  private liveBranchEntries(context: PromptContext, messages: readonly PiAgentMessage[]): SessionEntry[] {
    return createLiveBranchEntries({
      contentPartsMetadata: {contentParts: context.messageContext.contentParts},
      messages,
      parentId: context.baseParentId,
      sessionId: context.sessionInfo.id,
    });
  }

  /** Builds a one-time title update when this request generated the session title. */
  private titleSummary(context: PromptContext): SessionSummary | undefined {
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
