import type {AgentSession, CompactionResult} from "@earendil-works/pi-coding-agent";
import type {CompactSessionPayload, SendMessagePayload, SessionStreamEvent} from "@supernova/contracts/sessions/procedures";
import type {ModelReference, Session, SessionSummary, Turn} from "@supernova/contracts/sessions/schemas";
import {Context, Effect, Layer, Stream} from "effect";
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
import {SessionEventBus} from "@supernova/agent-runtime/implementations/pi/sessions/internal/session-event-bus";
import type {SessionEventBusShape} from "@supernova/agent-runtime/implementations/pi/sessions/internal/session-event-bus";
import {toPiSessionSummary} from "@supernova/agent-runtime/implementations/pi/projects/pi-session-mapper";
import {toPiThinkingLevel} from "@supernova/agent-runtime/implementations/pi/sessions/lib/models/thinking-levels";
import {createLiveBranchEntries} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/live-branch-entries";
import {buildPiTurns} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns-builder";
import type {SendMessageContext} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/send-message-context";
import {prepareSendMessageContext} from "@supernova/agent-runtime/implementations/pi/sessions/lib/user-message/send-message-context";

type PiAgentMessage = AgentSession["messages"][number];
type AgentSessionEventQueueAccessor = {readonly _agentEventQueue?: Promise<void>};

interface RuntimeDependencies {
  readonly agentSessionFactory: PiAgentSessionFactoryShape;
  readonly eventBus: SessionEventBusShape;
  readonly modelCatalog: PiModelCatalogShape;
  readonly resourceCatalog: PiResourceCatalogShape;
  readonly sessionStore: PiSessionStoreShape;
  readonly titleGenerator: PiSessionTitleGeneratorShape;
}

class SessionRuntimePool {
  private readonly dependencies: RuntimeDependencies;
  // Keep one runtime per active session so delayed Pi continuations, retries, and subscriptions
  // outlive the request that accepted the original user message.
  // TODO: Consider releasing inactive runtimes after a conservative idle timeout once we can prove Pi has no pending continuation, queued event processing, or delayed retry left to run.
  private readonly runners = new Map<string, SessionRuntime>();

  public constructor(dependencies: RuntimeDependencies) {
    this.dependencies = dependencies;
  }

  /** Starts accepted work on a long-lived runtime for the target session. */
  public async sendMessage(input: SendMessagePayload): Promise<void> {
    const runner = this.runners.get(input.sessionId) ?? new SessionRuntime({...this.dependencies, sessionId: input.sessionId});
    this.runners.set(input.sessionId, runner);
    await runner.sendMessage(input);
  }

  /** Explicitly aborts and disposes the runtime for one session. */
  public async abortSession(sessionId: string): Promise<void> {
    await this.runners.get(sessionId)?.release({abort: true});
    this.runners.delete(sessionId);
  }

  /** Starts manual compaction on a long-lived runtime for the target session. */
  public async compactSession(input: CompactSessionPayload): Promise<void> {
    const runner = this.runners.get(input.sessionId) ?? new SessionRuntime({...this.dependencies, sessionId: input.sessionId});
    this.runners.set(input.sessionId, runner);
    await runner.compactSession(input);
  }

  /** Aborts all retained runtimes during server/runtime shutdown. */
  public async dispose(): Promise<void> {
    await Promise.all([...this.runners.values()].map((runner) => runner.release({abort: true})));
  }
}

interface ActiveTurnInput {
  readonly sessionInfo: PiSessionInfo;
  readonly baseParentId: string | null;
  readonly messageContext: SendMessageContext;
  readonly modelReference: ModelReference;
}

/** Command-scoped runtime state for one accepted user turn while Pi may still emit live events. */
class ActiveTurn {
  private readonly sessionManager: PiSessionManager;

  private readonly sessionInfo: PiSessionInfo;
  private readonly baseParentId: string | null;
  private readonly messageContext: SendMessageContext;
  private readonly modelReference: ModelReference;
  /**
   * Runtime-owned live transcript for this turn.
   *
   * Pi only appends completed messages to `activeSession.messages`, while active output lives
   * in `streamingMessage`; compaction can also rebuild arrays and invalidate index slicing.
   */
  private readonly liveMessages: PiAgentMessage[] = [];

  public constructor(input: ActiveTurnInput, sessionManager: PiSessionManager) {
    this.baseParentId = input.baseParentId;
    this.messageContext = input.messageContext;
    this.modelReference = input.modelReference;
    this.sessionInfo = input.sessionInfo;

    this.sessionManager = sessionManager;
  }

  /** Prepared prompt text passed to Pi for this turn. */
  public get prompt(): string {
    return this.messageContext.prompt;
  }

  /** Prepared prompt images passed to Pi for this turn. */
  public get images(): SendMessageContext["images"] {
    return this.messageContext.images;
  }

  /** Appends Supernova-authored metadata entries that must precede the submitted user message. */
  public appendCustomEntries(): void {
    for (const entry of this.messageContext.customEntries) this.sessionManager.appendCustomEntry(entry.customType, entry.data);
  }

  /** Appends a live Pi message according to Pi's ordered message lifecycle. */
  public appendLiveMessage(message: PiAgentMessage): void {
    this.liveMessages.push(message);
  }

  /** Replaces the currently active live Pi message. */
  public replaceLastLiveMessage(message: PiAgentMessage): void {
    if (this.liveMessages.length === 0) {
      this.liveMessages.push(message);
      return;
    }

    this.liveMessages[this.liveMessages.length - 1] = message;
  }

  /** Adds a pending live compaction marker using Pi's context-summary message shape. */
  public appendLiveCompaction(): void {
    this.appendLiveMessage({role: "compactionSummary", summary: "", timestamp: Date.now(), tokensBefore: 0} satisfies PiAgentMessage);
  }

  /** Completes or removes the pending live compaction marker. */
  public completeLiveCompaction(result: CompactionResult | undefined): void {
    if (!result) {
      if (this.liveMessages.at(-1)?.role === "compactionSummary") this.liveMessages.pop();
      return;
    }

    // Pi emits compaction as a compact start/end pair outside the message lifecycle.
    // No user/assistant/toolResult message events are expected between those two events,
    // so the pending compaction marker we appended on start should still be the last item.
    const current = this.liveMessages.at(-1);
    const message = {
      role: "compactionSummary",
      summary: result.summary,
      timestamp: current?.role === "compactionSummary" ? current.timestamp : Date.now(),
      tokensBefore: result.tokensBefore,
    } satisfies PiAgentMessage;

    if (current?.role !== "compactionSummary") this.appendLiveMessage(message);
    else this.replaceLastLiveMessage(message);
  }

  /** Builds only the active turn projection; committed turns are unchanged while streaming. */
  public buildLiveTurn(): Turn | undefined {
    const liveEntries = createLiveBranchEntries({
      contentParts: this.messageContext.contentParts,
      messages: this.liveMessages,
      parentId: this.baseParentId,
      sessionId: this.sessionInfo.id,
    });
    const [turn] = buildPiTurns(liveEntries, this.modelReference);
    return turn ? ({...turn, status: "streaming"} satisfies Turn) : undefined;
  }

  /** Builds the authoritative committed snapshot after Pi has persisted and drained the turn. */
  public buildSettledSnapshot(): {session: Session} {
    return this.buildSnapshot(buildPiTurns(this.sessionManager.getBranch(), this.modelReference));
  }

  private buildSnapshot(turns: readonly Turn[]): {session: Session} {
    const summary = toPiSessionSummary(this.sessionInfo);
    const latestTurn = turns.at(-1);

    return {
      session: {
        id: this.sessionInfo.id,
        model: this.modelReference,
        projectPath: this.sessionInfo.cwd,
        title: this.sessionManager.getSessionName() ?? summary.title,
        turns,
        updatedAt: latestTurn?.completedAt ?? latestTurn?.startedAt ?? summary.updatedAt,
      },
    };
  }
}

type OpenedSession = {
  readonly sessionInfo: PiSessionInfo;
  readonly model: PiModel;
  readonly modelReference: ModelReference;
  readonly titleWasGenerated: boolean;
  readonly sessionManager: PiSessionManager;
};

/** Maintains one long-lived Pi AgentSession subscription for a Supernova session. */
class SessionRuntime {
  private readonly agentSessionFactory: PiAgentSessionFactoryShape;
  private readonly eventBus: SessionEventBusShape;
  private readonly modelCatalog: PiModelCatalogShape;
  private readonly resourceCatalog: PiResourceCatalogShape;
  private readonly sessionId: string;
  private readonly sessionStore: PiSessionStoreShape;
  private readonly titleGenerator: PiSessionTitleGeneratorShape;

  /** Long-lived Pi session reused across sends so delayed continuations stay observable. */
  private activeSession: AgentSession | undefined;
  /** Current session's active turn */
  private activeTurn: ActiveTurn | undefined;
  /** True after explicit abort/release so late background errors are not reported as user-visible failures. */
  private cancelled = false;
  /** Serializes event publication so client-side revision ordering matches delivery ordering. */
  private publishQueue: Promise<void> = Promise.resolve();
  /** In-flight single-flight release operation shared by abort and shutdown paths. */
  private releasePromise: Promise<void> | undefined;
  /** Prevents overlapping sends from mutating the same Pi session and persisted branch. */
  private running = false;
  /** Per-session monotonic event version used by the client to ignore stale events. */
  private revision = 0;
  /** Subscription cleanup for the long-lived Pi event listener. */
  private unsubscribe: (() => void) | undefined;

  public constructor(input: RuntimeDependencies & {readonly sessionId: string}) {
    this.agentSessionFactory = input.agentSessionFactory;
    this.eventBus = input.eventBus;
    this.modelCatalog = input.modelCatalog;
    this.resourceCatalog = input.resourceCatalog;
    this.sessionId = input.sessionId;
    this.sessionStore = input.sessionStore;
    this.titleGenerator = input.titleGenerator;
  }

  /** Sends a message to the session. */
  public async sendMessage(input: SendMessagePayload): Promise<void> {
    if (this.running) throw new Error("Session already has active work.");

    this.running = true;
    this.cancelled = false;

    const openedSession = await this.openSession(input);
    const agentSession = await this.getAgentSession(openedSession, input);

    this.activeTurn = await this.createActiveTurn(agentSession, openedSession, input);

    if (!this.unsubscribe) this.subscribeToLiveUpdates();

    void (async () => {
      try {
        await this.publishGeneratedTitle(openedSession);
        this.activeTurn!.appendCustomEntries();
        await this.sendPrompt();
      } catch (cause) {
        if (!this.cancelled)
          await this.publish({
            type: "session.error",
            revision: this.nextRevision(),
            sessionId: this.sessionId,
            error: cause instanceof Error ? cause.message : "Failed to send message.",
          });
      } finally {
        this.running = false;
      }
    })();
  }

  /** Manually compacts the session context without submitting a user turn. */
  public async compactSession(input: CompactSessionPayload): Promise<void> {
    if (this.running) throw new Error("Session already has active work.");

    this.running = true;
    this.cancelled = false;

    try {
      const openedSession = await this.openSessionForModel(input.sessionId, input.model);

      const agentSession = await this.getAgentSession(openedSession, {contentParts: [], model: input.model, sessionId: input.sessionId});
      const runtimeSession = {...openedSession, sessionManager: agentSession.sessionManager};

      this.activeTurn = undefined;

      await this.publish({type: "session.compaction.started", revision: this.nextRevision(), sessionId: this.sessionId});
      await agentSession.compact();
      await this.waitForPiEventQueue();
      await this.publish({type: "session.compaction.ended", revision: this.nextRevision(), sessionId: this.sessionId, willContinue: false});

      await this.publishSessionSnapshot(runtimeSession);
    } catch (cause) {
      await this.publish({type: "session.compaction.ended", revision: this.nextRevision(), sessionId: this.sessionId, willContinue: false});
      await this.publish({
        type: "session.error",
        revision: this.nextRevision(),
        sessionId: this.sessionId,
        error: cause instanceof Error ? cause.message : "Failed to compact session.",
      });
    } finally {
      this.running = false;
    }
  }

  /** Releases the underlying Pi session and optionally aborts active provider work. */
  public async release(input: {abort: boolean}): Promise<void> {
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

  /** Ensures the session has a title, generating one if necessary.
   *
   * @returns True if a title was generated, false if a title already existed.
   */
  private async ensureSessionTitle(input: SendMessagePayload, model: PiModel, sessionManager: PiSessionManager): Promise<boolean> {
    if (sessionManager.getSessionName() !== undefined) return false;

    const title = await this.titleGenerator.generateSessionTitle({contentParts: input.contentParts, model}).catch(() => "Unknown session");

    sessionManager.appendSessionInfo(title);

    return true;
  }

  /** Opens the durable Pi session and resolves command-scoped model/title state. */
  private async openSession(input: SendMessagePayload): Promise<OpenedSession> {
    const {info: sessionInfo, manager: sessionManager} = await this.sessionStore.openSessionById(this.sessionId);

    const model = this.findSelectedModel(input);
    const titleWasGenerated = await this.ensureSessionTitle(input, model, sessionManager);

    return {
      model,
      modelReference: input.model,
      sessionInfo,
      sessionManager,
      titleWasGenerated,
    };
  }

  /** Opens the durable Pi session and resolves the model for non-message commands. */
  private async openSessionForModel(sessionId: string, modelReference: ModelReference): Promise<OpenedSession> {
    const {info: sessionInfo, manager: sessionManager} = await this.sessionStore.openSessionById(sessionId);
    const model = this.findSelectedModel({contentParts: [], model: modelReference, sessionId});

    return {
      model,
      modelReference,
      sessionInfo,
      sessionManager,
      titleWasGenerated: false,
    };
  }

  /** Finds the selected Pi model, failing the command before any prompt is submitted. */
  private findSelectedModel(input: SendMessagePayload): PiModel {
    const model = this.modelCatalog.getAvailableModels().find((candidate) => candidate.provider === input.model.providerId && candidate.id === input.model.id);
    if (!model) throw new Error("Selected model is not available.");
    return model;
  }

  /** Creates or reuses the long-lived Pi AgentSession and applies this command's runtime settings. */
  private async getAgentSession(openedSession: OpenedSession, input: SendMessagePayload): Promise<AgentSession> {
    if (!this.activeSession) {
      const {session} = await this.agentSessionFactory.createAgentSession({cwd: openedSession.sessionInfo.cwd, sessionManager: openedSession.sessionManager});
      this.activeSession = session;
    }

    await this.activeSession.setModel(openedSession.model);
    this.activeSession.setThinkingLevel(toPiThinkingLevel(input.model.thinkingLevel));

    return this.activeSession;
  }

  /** Captures the stable branch baseline and prepared user message for one active turn. */
  private async createActiveTurn(agentSession: AgentSession, openedSession: OpenedSession, input: SendMessagePayload): Promise<ActiveTurn> {
    const sessionManager = agentSession.sessionManager;
    const baseBranch = sessionManager.getBranch();

    const messageContext = await prepareSendMessageContext(input, {projectPath: openedSession.sessionInfo.cwd, resourceCatalog: this.resourceCatalog});

    return new ActiveTurn(
      {
        sessionInfo: openedSession.sessionInfo,
        modelReference: openedSession.modelReference,
        messageContext,
        baseParentId: baseBranch.at(-1)?.id ?? null,
      },
      sessionManager
    );
  }

  /** Publishes a metadata update when accepting this command generated the session title. */
  private async publishGeneratedTitle(openedSession: OpenedSession): Promise<void> {
    if (!openedSession.titleWasGenerated) return;
    await this.publish({type: "session.updated", revision: this.nextRevision(), sessionId: this.sessionId, summary: this.sessionSummary(openedSession)});
  }

  /** Builds current session metadata for title/sidebar updates. */
  private sessionSummary(openedSession: OpenedSession): SessionSummary {
    return {id: openedSession.sessionInfo.id, title: openedSession.sessionManager.getSessionName() ?? "Untitled", updatedAt: new Date().toISOString()};
  }

  /** Subscribes once to Pi events and republishes the public session event model. */
  private subscribeToLiveUpdates(): void {
    this.unsubscribe = this.activeSession?.subscribe((event) => {
      const activeTurn = this.activeTurn;
      if (!activeTurn) return;

      switch (event.type) {
        case "agent_start":
          void this.publish({type: "session.agent.started", revision: this.nextRevision(), sessionId: this.sessionId});
          break;
        case "agent_end":
          void this.publish({type: "session.agent.ended", revision: this.nextRevision(), sessionId: this.sessionId});
          break;
        // Pi emits message lifecycle events in order: start appends the active message,
        // updates and end replace that same last message. Tool results use the same
        // start/end lifecycle; compaction does not, so we model it separately below.
        case "message_start":
          activeTurn.appendLiveMessage(event.message);
          void this.publishLiveTurn(activeTurn);
          break;
        case "message_update":
        case "message_end":
          activeTurn.replaceLastLiveMessage(event.message);
          void this.publishLiveTurn(activeTurn);
          break;
        case "tool_execution_start":
        case "tool_execution_end":
          void this.publishLiveTurn(activeTurn);
          break;
        case "compaction_start":
          activeTurn.appendLiveCompaction();
          void this.publish({type: "session.compaction.started", revision: this.nextRevision(), sessionId: this.sessionId});
          void this.publishLiveTurn(activeTurn);
          break;
        case "compaction_end":
          activeTurn.completeLiveCompaction(event.result);
          void this.publish({type: "session.compaction.ended", revision: this.nextRevision(), sessionId: this.sessionId, willContinue: event.willRetry});
          void this.publishLiveTurn(activeTurn);
          break;
      }
    });
  }

  /** Submits the prepared prompt and publishes the latest committed branch after Pi drains queued processing. */
  private async sendPrompt(): Promise<void> {
    const activeTurn = this.activeTurn;
    if (!activeTurn) throw new Error("Cannot send prompt without active turn.");

    try {
      const images = activeTurn.images;
      await this.activeSession?.prompt(activeTurn.prompt, images.length > 0 ? {images: [...images]} : undefined);
      await this.waitForPiEventQueue();
      await this.publishSettledSnapshot(activeTurn);
    } finally {
      if (this.cancelled) await this.release({abort: false});
    }
  }

  /** Publishes only the live turn, mirroring the old per-send `turn` stream event. */
  private async publishLiveTurn(activeTurn: ActiveTurn): Promise<void> {
    const turn = activeTurn.buildLiveTurn();
    if (!turn) return;

    await this.publish({type: "session.turn", revision: this.nextRevision(), sessionId: this.sessionId, turn});
  }

  /** Publishes the latest committed branch from Pi's session manager. */
  private async publishSettledSnapshot(activeTurn: ActiveTurn): Promise<void> {
    const snapshot = activeTurn.buildSettledSnapshot();
    await this.publish({type: "session.snapshot", revision: this.nextRevision(), sessionId: this.sessionId, ...snapshot});
  }

  /** Publishes a committed snapshot for commands that do not own an active turn. */
  private async publishSessionSnapshot(openedSession: OpenedSession): Promise<void> {
    const summary = toPiSessionSummary(openedSession.sessionInfo);
    const turns = buildPiTurns(openedSession.sessionManager.getBranch(), openedSession.modelReference);

    const latestTurn = turns.at(-1);

    await this.publish({
      type: "session.snapshot",
      revision: this.nextRevision(),
      sessionId: this.sessionId,
      session: {
        id: openedSession.sessionInfo.id,
        model: openedSession.modelReference,
        projectPath: openedSession.sessionInfo.cwd,
        title: openedSession.sessionManager.getSessionName() ?? summary.title,
        turns,
        updatedAt: latestTurn?.completedAt ?? latestTurn?.startedAt ?? summary.updatedAt,
      },
    });
  }

  /** Waits for Pi's queued session event processing, which owns post-agent auto-compaction. */
  private async waitForPiEventQueue(): Promise<void> {
    // AgentSession.prompt() can resolve before Pi finishes queued agent_end processing.
    // Auto-compaction runs from that queue, so wait before emitting the settled snapshot.
    await (this.activeSession as unknown as AgentSessionEventQueueAccessor | undefined)?._agentEventQueue;
  }

  /** Returns the next monotonic revision for this session runtime. */
  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  /** Publishes one event through the shared session event bus. */
  private publish(event: SessionStreamEvent): Promise<void> {
    const nextPublish = this.publishQueue.catch(() => undefined).then(() => Effect.runPromise(this.eventBus.publish(event)));
    this.publishQueue = nextPublish;
    return nextPublish;
  }
}

interface SessionRuntimeManagerShape {
  readonly abortSession: (sessionId: string) => Effect.Effect<void>;
  readonly compactSession: (input: CompactSessionPayload) => Effect.Effect<void>;
  readonly sendMessage: (input: SendMessagePayload) => Effect.Effect<void>;
  readonly watchEvents: () => Stream.Stream<SessionStreamEvent>;
}

/** Owns long-lived Pi session runtimes and publishes their observable events. */
export class SessionRuntimeManager extends Context.Service<SessionRuntimeManager, SessionRuntimeManagerShape>()("supernova/agent-runtime/SessionRuntimeManager") {}

export const SessionRuntimeManagerLive = Layer.effect(
  SessionRuntimeManager,
  Effect.gen(function* () {
    const agentSessionFactory = yield* PiAgentSessionFactory;
    const eventBus = yield* SessionEventBus;
    const modelCatalog = yield* PiModelCatalog;
    const resourceCatalog = yield* PiResourceCatalog;
    const sessionStore = yield* PiSessionStore;
    const titleGenerator = yield* PiSessionTitleGenerator;
    const pool = new SessionRuntimePool({agentSessionFactory, eventBus, modelCatalog, resourceCatalog, sessionStore, titleGenerator});

    return {
      abortSession: (sessionId: string) => Effect.promise(() => pool.abortSession(sessionId)),
      compactSession: (input: CompactSessionPayload) => Effect.promise(() => pool.compactSession(input)),
      sendMessage: (input: SendMessagePayload) => Effect.promise(() => pool.sendMessage(input)),
      watchEvents: () => Stream.concat(Stream.make({type: "connected"} satisfies SessionStreamEvent), eventBus.stream()),
    };
  })
);
