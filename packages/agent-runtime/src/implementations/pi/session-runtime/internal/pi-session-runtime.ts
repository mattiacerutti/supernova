import type {AgentSession} from "@earendil-works/pi-coding-agent";
import type {SessionStreamEvent} from "@supernova/contracts/sessions/procedures";
import type {ModelReference, SessionSummary} from "@supernova/contracts/sessions/schemas";
import {Effect} from "effect";
import type {PiModel, PiModelCatalogShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-model-catalog";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-resource-catalog";
import type {PiSessionInfo, PiSessionManager, PiSessionStoreShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-session-store";
import type {PiAgentSessionFactoryShape} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-agent-session-factory";
import type {PiSessionTitleGeneratorShape} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-title-generator";
import type {SessionCheckpointStoreShape} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-checkpoint-store";
import type {SessionEventBusShape} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-event-bus";
import {buildSessionSnapshot} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/session-snapshot";
import {findSelectedModel} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/models/selected-model";
import {toPiThinkingLevel} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/models/thinking-levels";
import {ActiveTurn} from "@supernova/agent-runtime/implementations/pi/session-runtime/lib/turns/active-turn";

type AgentSessionEventQueueAccessor = {readonly _agentEventQueue?: Promise<void>};
type RevisionedSessionStreamEvent = Extract<SessionStreamEvent, {readonly revision: number}>;
type UnrevisionedSessionStreamEvent = RevisionedSessionStreamEvent extends infer Event ? (Event extends {readonly revision: number} ? Omit<Event, "revision"> : never) : never;

export interface OpenedRuntimeSession {
  readonly sessionInfo: PiSessionInfo;
  readonly model: PiModel;
  readonly modelReference: ModelReference;
  readonly titleWasGenerated: boolean;
  readonly sessionManager: PiSessionManager;
}

export interface PiSessionRuntimeDependencies {
  readonly agentSessionFactory: PiAgentSessionFactoryShape;
  readonly eventBus: SessionEventBusShape;
  readonly modelCatalog: PiModelCatalogShape;
  readonly resourceCatalog: PiResourceCatalogShape;
  readonly checkpointStore: SessionCheckpointStoreShape;
  readonly sessionStore: PiSessionStoreShape;
  readonly titleGenerator: PiSessionTitleGeneratorShape;
}

export interface PiSessionRuntimeInput extends PiSessionRuntimeDependencies {
  readonly sessionId: string;
}

/** Maintains one long-lived Pi AgentSession subscription for a Supernova session. */
export class PiSessionRuntime {
  public readonly resourceCatalog: PiResourceCatalogShape;
  public readonly sessionId: string;
  public readonly titleGenerator: PiSessionTitleGeneratorShape;

  private readonly agentSessionFactory: PiAgentSessionFactoryShape;
  private readonly checkpointStore: SessionCheckpointStoreShape;
  private readonly eventBus: SessionEventBusShape;
  private readonly modelCatalog: PiModelCatalogShape;
  private readonly sessionStore: PiSessionStoreShape;

  private activeSession: AgentSession | undefined;
  private activeTurn: ActiveTurn | undefined;
  private cancelled = false;
  private publishQueue: Promise<void> = Promise.resolve();
  private releasePromise: Promise<void> | undefined;
  private running = false;
  private revision = 0;
  private unsubscribe: (() => void) | undefined;

  public constructor(input: PiSessionRuntimeInput) {
    this.agentSessionFactory = input.agentSessionFactory;
    this.checkpointStore = input.checkpointStore;
    this.eventBus = input.eventBus;
    this.modelCatalog = input.modelCatalog;
    this.resourceCatalog = input.resourceCatalog;
    this.sessionId = input.sessionId;
    this.sessionStore = input.sessionStore;
    this.titleGenerator = input.titleGenerator;
  }

  /** Marks this runtime as busy for a command. */
  public beginWork(): void {
    if (this.running) throw new Error("Session already has active work.");
    this.running = true;
    this.cancelled = false;
  }

  /** Marks this runtime as no longer running an accepted command. */
  public endWork(): void {
    this.running = false;
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

  /** Opens the durable Pi session and applies command-scoped model settings when provided. */
  public async openSession(sessionId: string, modelReference?: ModelReference): Promise<OpenedRuntimeSession> {
    const {info: sessionInfo, manager: sessionManager} = await this.sessionStore.openSessionById(sessionId);
    const resolvedModelReference = modelReference ?? this.currentModelReference(sessionManager);
    const model = findSelectedModel(this.modelCatalog, resolvedModelReference);

    const openedSession = {model, modelReference: resolvedModelReference, sessionInfo, sessionManager, titleWasGenerated: false};
    const agentSession = await this.getAgentSession(openedSession);

    if (modelReference) {
      await agentSession.setModel(model);
      agentSession.setThinkingLevel(toPiThinkingLevel(modelReference.thinkingLevel));
    }

    return {...openedSession, sessionManager: agentSession.sessionManager};
  }

  private currentModelReference(sessionManager: PiSessionManager): ModelReference {
    const sessionContext = sessionManager.buildSessionContext();
    if (!sessionContext.model) throw new Error("Session model was not found.");

    return {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel};
  }

  /** Creates or reuses the long-lived Pi AgentSession. */
  private async getAgentSession(openedSession: OpenedRuntimeSession): Promise<AgentSession> {
    if (!this.activeSession) {
      const {session} = await this.agentSessionFactory.createAgentSession({cwd: openedSession.sessionInfo.cwd, sessionManager: openedSession.sessionManager});
      this.activeSession = session;
    }

    return this.activeSession;
  }

  /** Sets the active turn and ensures Pi events are subscribed. */
  public activateTurn(activeTurn: ActiveTurn): void {
    this.activeTurn = activeTurn;
    if (!this.unsubscribe) this.subscribeToLiveUpdates();
  }

  /** Clears active turn state for commands that do not own a user turn. */
  public clearActiveTurn(): void {
    this.activeTurn = undefined;
  }

  /** Submits a prepared active turn prompt and publishes the settled snapshot. */
  public async sendActiveTurn(activeTurn: ActiveTurn, onEnd?: () => Promise<void>): Promise<void> {
    try {
      const images = activeTurn.images;
      await this.activeSession?.prompt(activeTurn.prompt, images.length > 0 ? {images: [...images]} : undefined);

      await this.waitForPiEventQueue();

      await onEnd?.();
      await this.publishSettledSnapshot(activeTurn);
    } finally {
      if (this.cancelled) await this.release({abort: false});
    }
  }

  /** Runs Pi manual compaction on the active session. */
  public async compactActiveSession(): Promise<void> {
    await this.activeSession?.compact();
    await this.waitForPiEventQueue();
  }

  /** Publishes a public runtime event with a fresh revision. */
  public publishEvent(event: UnrevisionedSessionStreamEvent): Promise<void> {
    return this.publish({...event, revision: this.nextRevision()} as RevisionedSessionStreamEvent);
  }

  /** Publishes session update event containing new session metadata. */
  public async publishSessionUpdate(openedSession: OpenedRuntimeSession): Promise<void> {
    if (!openedSession.titleWasGenerated) return;
    await this.publishEvent({type: "session.updated", sessionId: this.sessionId, summary: this.sessionSummary(openedSession)});
  }

  /** Publishes a committed snapshot for commands that do not own an active turn. */
  public async publishSessionSnapshot(openedSession: OpenedRuntimeSession): Promise<void> {
    await this.publishEvent({
      type: "session.snapshot",
      sessionId: this.sessionId,
      session: buildSessionSnapshot({sessionInfo: openedSession.sessionInfo, sessionManager: openedSession.sessionManager, modelReference: openedSession.modelReference}),
    });
  }

  /** Returns whether this runtime has been explicitly cancelled. */
  public isCancelled(): boolean {
    return this.cancelled;
  }

  /** Captures a stable workspace checkpoint for the current session project. */
  public async createCheckpoint(input: {readonly checkpointId: string; readonly cwd: string}): Promise<boolean> {
    return this.checkpointStore.create({checkpointId: input.checkpointId, cwd: input.cwd, sessionId: this.sessionId});
  }

  /** Restores the full workspace state from a stable checkpoint. */
  public async restoreCheckpoint(input: {readonly checkpointId: string; readonly cwd: string}): Promise<void> {
    await this.checkpointStore.restore({checkpointId: input.checkpointId, cwd: input.cwd, sessionId: this.sessionId});
  }

  private subscribeToLiveUpdates(): void {
    this.unsubscribe = this.activeSession?.subscribe((event) => {
      const activeTurn = this.activeTurn;
      if (!activeTurn) return;

      switch (event.type) {
        case "agent_start":
          void this.publishEvent({type: "session.agent.started", sessionId: this.sessionId});
          break;
        case "agent_end":
          void this.publishEvent({type: "session.agent.ended", sessionId: this.sessionId});
          break;
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
          void this.publishEvent({type: "session.compaction.started", sessionId: this.sessionId});
          void this.publishLiveTurn(activeTurn);
          break;
        case "compaction_end":
          activeTurn.completeLiveCompaction(event.result);
          void this.publishEvent({type: "session.compaction.ended", sessionId: this.sessionId, willContinue: event.willRetry});
          void this.publishLiveTurn(activeTurn);
          break;
      }
    });
  }

  private sessionSummary(openedSession: OpenedRuntimeSession): SessionSummary {
    return {id: openedSession.sessionInfo.id, title: openedSession.sessionManager.getSessionName() ?? "Untitled", updatedAt: new Date().toISOString()};
  }

  private async publishLiveTurn(activeTurn: ActiveTurn): Promise<void> {
    const turn = activeTurn.buildLiveTurn();
    if (!turn) return;

    await this.publishEvent({type: "session.turn", sessionId: this.sessionId, turn});
  }

  private async publishSettledSnapshot(activeTurn: ActiveTurn): Promise<void> {
    await this.publishEvent({type: "session.snapshot", sessionId: this.sessionId, ...activeTurn.buildSettledSnapshot()});
  }

  private async waitForPiEventQueue(): Promise<void> {
    await (this.activeSession as unknown as AgentSessionEventQueueAccessor | undefined)?._agentEventQueue;
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  private publish(event: SessionStreamEvent): Promise<void> {
    const nextPublish = this.publishQueue.catch(() => undefined).then(() => Effect.runPromise(this.eventBus.publish(event)));
    this.publishQueue = nextPublish;
    return nextPublish;
  }
}
