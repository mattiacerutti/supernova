import type {AgentSession, SessionEntry} from "@mariozechner/pi-coding-agent";
import {Effect, Queue, Stream} from "effect";
import type {SessionMessageSendPayload, SessionStreamEvent} from "@pi-desktop/contracts/sessions/procedures";
import type {SessionSummary} from "@pi-desktop/contracts/sessions/schemas";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape, PiSessionInfo} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {
  ATTACHMENTS_CUSTOM_TYPE,
  TEXT_ATTACHMENTS_CUSTOM_TYPE,
  prepareSessionAttachments,
} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/attachments/session-attachments";
import type {PreparedSessionAttachments} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/attachments/session-attachments";
import {findSessionById} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-resolver";
import {generateSessionTitle} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-title-generator";
import {createLiveBranchEntries} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/turns/live-branch-entries";
import {buildPiSessionTurns} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/session-turns-builder";
import {toPiThinkingLevel} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/models/thinking-levels";
import {USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, validContentPartsForMessage} from "@pi-desktop/agent-runtime/implementations/pi/sessions/lib/user-message-content-parts";

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
  readonly attachments: PreparedSessionAttachments;
  readonly baseBranch: readonly SessionEntry[];
  readonly baseMessageCount: number;
  readonly baseParentId: string | null;
};

export function sendSessionMessage(input: SessionMessageSendPayload) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const piSdk = yield* PiSdkService;

      return Stream.callback<SessionStreamEvent>((queue) =>
        Effect.gen(function* () {
          const runner = new SendSessionMessageRunner({
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

class SendSessionMessageRunner {
  private readonly emit: (event: SessionStreamEvent) => void;
  private readonly end: () => void;
  private readonly input: SessionMessageSendPayload;
  private readonly piSdk: PiSdkServiceShape;
  private activeSession: AgentSession | undefined;
  private cancelled = false;
  private emittedGeneratedTitle = false;
  private releasePromise: Promise<void> | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(input: {emit: (event: SessionStreamEvent) => void; end: () => void; input: SessionMessageSendPayload; piSdk: PiSdkServiceShape}) {
    this.emit = input.emit;
    this.end = input.end;
    this.input = input.input;
    this.piSdk = input.piSdk;
  }

  start(): void {
    void this.run();
  }

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

  private async run(): Promise<void> {
    try {
      const openedSession = await this.openSession();
      const context = await this.preparePromptContext(openedSession);

      this.emit({turns: buildPiSessionTurns(context.baseBranch, this.input.model), type: "ready"});
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

  private async ensureSessionTitle(sessionManager: PiSessionManager, model: PiModel): Promise<boolean> {
    if (sessionManager.getSessionName() !== undefined) return false;

    const title = await generateSessionTitle({
      attachmentNames: this.input.attachments.map((attachment) => attachment.name),
      message: this.input.message,
      model,
      modelRegistry: this.piSdk.modelRegistry,
    }).catch(() => this.input.message);

    sessionManager.appendSessionInfo(title);
    return true;
  }

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
      attachments: prepareSessionAttachments(this.input.attachments),
      baseBranch,
      baseMessageCount: session.messages.length,
      baseParentId: baseBranch.at(-1)?.id ?? null,
    };
  }

  private async appendUserMessageContext(context: PromptContext): Promise<void> {
    if (context.attachments.metadata.length > 0) {
      context.sessionManager.appendCustomEntry(ATTACHMENTS_CUSTOM_TYPE, {attachments: context.attachments.metadata});
    }

    const contentParts = validContentPartsForMessage(this.input.message, this.input.contentParts);
    if (contentParts) {
      context.sessionManager.appendCustomEntry(USER_MESSAGE_CONTENT_PARTS_CUSTOM_TYPE, {contentParts});
    }

    if (!context.attachments.textContent) return;

    await this.activeSession?.sendCustomMessage(
      {
        content: context.attachments.textContent,
        customType: TEXT_ATTACHMENTS_CUSTOM_TYPE,
        details: {attachmentIds: context.attachments.metadata.filter((attachment) => attachment.kind === "text").map((attachment) => attachment.id)},
        display: false,
      },
      {deliverAs: "nextTurn"}
    );
  }

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

  private async promptAndEmitFinalTurns(context: PromptContext): Promise<void> {
    try {
      await this.activeSession?.prompt(this.input.message, context.attachments.images.length > 0 ? {images: context.attachments.images} : undefined);
      const liveEntries = this.liveBranchEntries(context, this.activeSession?.messages.slice(context.baseMessageCount) ?? []);
      this.emit({turns: buildPiSessionTurns([...context.baseBranch, ...liveEntries], this.input.model), type: "done"});
    } finally {
      await this.release({abort: false});
    }
  }

  private emitLiveTurn(context: PromptContext, messages: readonly PiAgentMessage[]): void {
    const [turn] = buildPiSessionTurns(this.liveBranchEntries(context, messages), this.input.model);
    if (!turn) return;

    const session = this.titleSummary(context);
    this.emit(session ? {session, turn: {...turn, status: "streaming"}, type: "turn"} : {turn: {...turn, status: "streaming"}, type: "turn"});
  }

  private liveMessages(context: PromptContext, message?: PiAgentMessage): readonly PiAgentMessage[] {
    const messages = this.activeSession?.messages.slice(context.baseMessageCount) ?? [];
    if (!message || messages.some((candidate) => candidate === message)) return messages;
    return [...messages, message];
  }

  private liveBranchEntries(context: PromptContext, messages: readonly PiAgentMessage[]): SessionEntry[] {
    return createLiveBranchEntries({
      attachmentMetadata: {attachments: context.attachments.metadata},
      contentPartsMetadata: {contentParts: validContentPartsForMessage(this.input.message, this.input.contentParts) ?? []},
      messages,
      parentId: context.baseParentId,
      sessionId: context.sessionInfo.id,
    });
  }

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
