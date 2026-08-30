import type {AgentSession} from "@earendil-works/pi-coding-agent";
import {randomUUID} from "node:crypto";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, Session} from "@supernova/contracts/sessions/schemas";
import {Effect} from "effect";
import type {PiModel, PiModelCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import type {PiSessionManager, PiSessionStoreShape} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import type {PiAgentSessionFactoryShape} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-agent-session-factory";
import type {CheckpointStoreShape} from "@supernova/agent-runtime/layers/session-runtime/internal/checkpoint-store";
import {CheckpointConflictError} from "@supernova/agent-runtime/layers/session-runtime/internal/shadow-repository";
import type {SessionEventBusShape} from "@supernova/agent-runtime/layers/session-runtime/internal/session-event-bus";
import {
  CHECKPOINT_CURSOR_CUSTOM_TYPE,
  CHECKPOINT_CUSTOM_TYPE,
  invalidateCheckpointRedo,
  isCapturedCheckpoint,
} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-entries";
import type {CheckpointEntry, CheckpointStatus} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-entries";
import {buildSessionSnapshot} from "@supernova/agent-runtime/layers/session-runtime/lib/session-snapshot";
import {findSelectedModel} from "@supernova/agent-runtime/layers/session-runtime/lib/models/selected-model";
import {toPiThinkingLevel} from "@supernova/agent-runtime/layers/session-runtime/lib/models/thinking-levels";
import {ActiveTurn} from "@supernova/agent-runtime/layers/session-runtime/lib/turns/active-turn";
import type {SendMessageContext} from "@supernova/agent-runtime/layers/session-runtime/lib/user-message/send-message-context";

type RevisionedSessionStreamEvent = Extract<SessionStreamEvent, {readonly revision: number}>;
type UnrevisionedSessionStreamEvent = RevisionedSessionStreamEvent extends infer Event ? (Event extends {readonly revision: number} ? Omit<Event, "revision"> : never) : never;

export interface PiSessionRuntimeDependencies {
  readonly agentSessionFactory: PiAgentSessionFactoryShape;
  readonly eventBus: SessionEventBusShape;
  readonly modelCatalog: PiModelCatalogShape;
  readonly resourceCatalog: PiResourceCatalogShape;
  readonly checkpointStore: CheckpointStoreShape;
  readonly sessionStore: PiSessionStoreShape;
}

export interface PiSessionRuntimeInput extends PiSessionRuntimeDependencies {
  readonly sessionId: string;
}

/** Maintains one long-lived Pi AgentSession subscription for a Supernova session. */
export class PiSessionRuntime {
  public readonly resourceCatalog: PiResourceCatalogShape;
  public readonly sessionId: string;

  private readonly agentSessionFactory: PiAgentSessionFactoryShape;
  private readonly checkpointStore: CheckpointStoreShape;
  private readonly eventBus: SessionEventBusShape;
  private readonly modelCatalog: PiModelCatalogShape;
  private readonly sessionStore: PiSessionStoreShape;

  private agentSession: AgentSession | undefined;
  private activeTurn: ActiveTurn | undefined;
  private committedSession: Session | undefined;

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
  }

  /** Marks this runtime as busy for a command. */
  public beginWork(): void {
    if (this.running) throw new Error("Session already has active work.");
    this.running = true;
    this.cancelled = false;
  }

  /** Marks this runtime as no longer running an accepted command. */
  public endWork(): void {
    this.activeTurn = undefined;
    this.committedSession = undefined;
    this.running = false;
  }

  /**
   * Disposes this runtime during server shutdown or pool teardown.
   *
   * This is a terminal lifecycle operation: it aborts any active Pi work,
   * unsubscribes from Pi events, and disposes the underlying Pi AgentSession.
   */
  public async dispose(): Promise<void> {
    if (!this.agentSession && !this.unsubscribe) return;
    if (this.releasePromise) return this.releasePromise;

    this.releasePromise = (async () => {
      await this.abort();
      const agentSession = this.agentSession;
      const unsubscribe = this.unsubscribe;

      this.agentSession = undefined;
      this.unsubscribe = undefined;

      unsubscribe?.();
      agentSession?.dispose();
    })();

    return this.releasePromise;
  }

  /**
   * Stops the current user-facing agent run without tearing down this runtime.
   *
   * This is used by the manual stop action. It aborts provider/Pi work but keeps
   * session-scoped runtime state, such as event revisions, available for the next command.
   */
  public async abort(): Promise<void> {
    this.cancelled = true;
    await this.agentSession?.abort().catch(() => undefined);
  }

  /** Returns the session manager owned by this runtime's Pi agent session. */
  public async getSessionManager(): Promise<PiSessionManager> {
    return (await this.getAgentSession()).sessionManager;
  }

  /** Resolves a public model reference against Pi's available model catalog. */
  public resolveModel(modelReference: ModelReference): PiModel {
    return findSelectedModel(this.modelCatalog, modelReference);
  }

  /** Applies model and thinking level to the active session. */
  public async selectModel(modelReference: ModelReference): Promise<void> {
    const agentSession = await this.getAgentSession();
    const model = this.resolveModel(modelReference);

    await agentSession.setModel(model);
    agentSession.setThinkingLevel(toPiThinkingLevel(modelReference.thinkingLevel));
  }

  /** Returns the selected model state represented by the active session branch. */
  public getSelectedModel(): {readonly model: PiModel; readonly modelReference: ModelReference} {
    if (!this.agentSession) throw new Error("Agent session is not initialized.");

    const {sessionManager} = this.agentSession;
    const sessionContext = sessionManager.buildSessionContext();
    if (!sessionContext.model) throw new Error("Session model was not found.");

    const modelReference = {id: sessionContext.model.modelId, providerId: sessionContext.model.provider, thinkingLevel: sessionContext.thinkingLevel};
    return {model: findSelectedModel(this.modelCatalog, modelReference), modelReference};
  }

  /** Accepts and starts one prepared user turn, returning its background completion. */
  public startTurn(input: {
    readonly beforeCheckpoint: {readonly checkpointId: string; readonly status: CheckpointStatus};
    readonly captureCheckpoints: boolean;
    readonly messageContext: SendMessageContext;
    readonly title: string | undefined;
  }): {readonly completion: Promise<void>} {
    if (this.cancelled) throw new Error("Session was cancelled.");

    const agentSession = this.agentSession;
    if (!agentSession) throw new Error("Agent session is not initialized.");

    const sessionManager = agentSession.sessionManager;
    const title = sessionManager.getSessionName() === undefined ? input.title : undefined;
    if (title) sessionManager.appendSessionInfo(title);

    invalidateCheckpointRedo(sessionManager);

    const selectedModel = this.getSelectedModel();
    const activeTurn = new ActiveTurn(
      {
        baseParentId: sessionManager.getBranch().at(-1)?.id ?? null,
        contextWindow: selectedModel.model.contextWindow,
        customEntries: [
          {
            customType: CHECKPOINT_CUSTOM_TYPE,
            data: {checkpointId: input.beforeCheckpoint.checkpointId, phase: "before-turn", status: input.beforeCheckpoint.status},
          },
        ],
        messageContext: input.messageContext,
        modelReference: selectedModel.modelReference,
      },
      sessionManager
    );
    activeTurn.appendCustomEntries();

    this.activeTurn = activeTurn;
    this.committedSession = buildSessionSnapshot({
      contextWindow: selectedModel.model.contextWindow,
      sessionManager,
      modelReference: selectedModel.modelReference,
    });
    if (!this.unsubscribe) this.subscribeToLiveUpdates();

    const sessionUpdate = title ? this.publishSessionUpdate() : Promise.resolve();

    const execution = (async () => {
      const images = activeTurn.images;
      await agentSession.prompt(activeTurn.prompt, images.length > 0 ? {images: [...images]} : undefined);
      await this.waitForPiSettlement();

      const afterTurnCheckpointId = randomUUID();
      const afterTurnStatus = await this.createCheckpoint(afterTurnCheckpointId, input.captureCheckpoints);
      sessionManager.appendCustomEntry(CHECKPOINT_CUSTOM_TYPE, {checkpointId: afterTurnCheckpointId, phase: "after-turn", status: afterTurnStatus});
      sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: sessionManager.getLeafId()});

      await this.publishSessionSnapshot();
    })();

    return {completion: Promise.all([execution, sessionUpdate]).then(() => undefined)};
  }

  /** Returns the committed session view while an active turn mutates Pi's branch. */
  public getCommittedSession(): Session | undefined {
    return this.running ? this.committedSession : undefined;
  }

  /**
   * Restores the workspace and moves the active Pi session to a checkpoint.
   *
   * Workspace files are restored only when both boundaries have durable manifests.
   * An uncovered boundary moves the conversation alone, leaving files as they are.
   * `force` discards conflicting manual changes; it bypasses no other preflight check.
   */
  public async navigateToCheckpoint(input: {
    readonly current: CheckpointEntry;
    readonly cursorLeafEntryId: string;
    readonly force: boolean;
    readonly target: CheckpointEntry;
  }): Promise<void> {
    const agentSession = this.agentSession;
    if (!agentSession) throw new Error("Agent session is not initialized.");

    const {current, cursorLeafEntryId, force, target} = input;
    const sessionManager = agentSession.sessionManager;
    if (isCapturedCheckpoint(target) && isCapturedCheckpoint(current)) {
      await this.restoreCheckpoint({
        checkpointId: target.data.checkpointId,
        force,
        fromCheckpointId: current.data.checkpointId,
        projectRoot: sessionManager.getCwd(),
      });
    }

    sessionManager.branch(target.id);
    sessionManager.appendCustomEntry(CHECKPOINT_CURSOR_CUSTOM_TYPE, {leafEntryId: cursorLeafEntryId});

    const selectedModel = this.getSelectedModel();
    agentSession.state.messages = sessionManager.buildSessionContext().messages;
    agentSession.state.model = selectedModel.model;
    agentSession.state.thinkingLevel = toPiThinkingLevel(selectedModel.modelReference.thinkingLevel);

    await this.publishSessionSnapshot();
  }

  /** Runs Pi manual compaction on the active session. */
  public async compactActiveSession(): Promise<void> {
    await this.agentSession?.compact();
    await this.waitForPiSettlement();
  }

  /** Publishes a public runtime event with a fresh revision. */
  public publishEvent(event: UnrevisionedSessionStreamEvent): Promise<void> {
    return this.publish({...event, revision: this.nextRevision()} as RevisionedSessionStreamEvent);
  }

  /** Publishes a committed snapshot for commands that do not own an active turn. */
  public async publishSessionSnapshot(): Promise<void> {
    const agentSession = await this.getAgentSession();
    const selectedModel = this.getSelectedModel();
    await this.publishEvent({
      type: "session.snapshot",
      sessionId: this.sessionId,
      session: buildSessionSnapshot({
        contextWindow: selectedModel.model.contextWindow,
        sessionManager: agentSession.sessionManager,
        modelReference: selectedModel.modelReference,
      }),
    });
  }

  /** Returns whether this runtime has been explicitly cancelled. */
  public isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Captures a workspace checkpoint for the current session project.
   *
   * Capture is best-effort: a failure leaves the boundary uncovered instead of
   * rejecting the command, so provider work is never blocked by checkpoint storage.
   */
  public async createCheckpoint(checkpointId: string, capture: boolean): Promise<CheckpointStatus> {
    if (!capture) return "disabled";
    const agentSession = await this.getAgentSession();
    try {
      await this.checkpointStore.capture({checkpointId, projectRoot: agentSession.sessionManager.getCwd(), sessionId: this.sessionId});
      return "captured";
    } catch {
      return "failed";
    }
  }

  /** Restores only files changed between checkpoints into the worktree, leaving Git HEAD and staged state untouched. */
  private async restoreCheckpoint(input: {readonly checkpointId: string; readonly force: boolean; readonly fromCheckpointId: string; readonly projectRoot: string}): Promise<void> {
    try {
      await this.checkpointStore.restore({...input, sessionId: this.sessionId});
    } catch (cause) {
      if (cause instanceof CheckpointConflictError) throw cause;
      throw new Error("Failed to restore workspace checkpoint.");
    }
  }

  /** Creates or returns the long-lived Pi AgentSession for this runtime. */
  private async getAgentSession(): Promise<AgentSession> {
    if (!this.agentSession) {
      const sessionManager = await this.sessionStore.openSessionById(this.sessionId);
      const {session} = await this.agentSessionFactory.createAgentSession({cwd: sessionManager.getCwd(), sessionManager});
      this.agentSession = session;
    }

    return this.agentSession;
  }

  private subscribeToLiveUpdates(): void {
    this.unsubscribe = this.agentSession?.subscribe((event) => {
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
          activeTurn.replaceLastLiveMessage(event.message);
          void this.publishLiveTurn(activeTurn);
          break;
        case "message_end":
          activeTurn.replaceLastLiveMessage(event.message);
          // Pi persists completed messages immediately after notifying subscribers.
          // Defer the context refresh so it observes the newly committed branch entry.
          void Promise.resolve().then(async () => {
            activeTurn.refreshContextUsage();
            await this.publishLiveTurn(activeTurn);
          });
          break;
        case "tool_execution_start":
          activeTurn.recordToolExecutionStart({args: event.args, toolCallId: event.toolCallId});
          void this.publishLiveTurn(activeTurn);
          break;
        case "compaction_start":
          activeTurn.appendLiveCompaction();
          void this.publishEvent({type: "session.compaction.started", sessionId: this.sessionId});
          void this.publishLiveTurn(activeTurn);
          break;
        case "compaction_end":
          activeTurn.completeLiveCompaction(event.result);
          activeTurn.refreshContextUsage();
          void this.publishEvent({type: "session.compaction.ended", sessionId: this.sessionId});
          void this.publishLiveTurn(activeTurn);
          break;
      }
    });
  }

  /** Publishes session metadata after generating its title. */
  private async publishSessionUpdate(): Promise<void> {
    const agentSession = await this.getAgentSession();
    await this.publishEvent({
      type: "session.updated",
      projectPath: agentSession.sessionManager.getCwd(),
      sessionId: this.sessionId,
      summary: {
        id: agentSession.sessionManager.getSessionId(),
        title: agentSession.sessionManager.getSessionName() ?? "Untitled session",
        updatedAt: new Date().toISOString(),
      },
    });
  }

  private async publishLiveTurn(activeTurn: ActiveTurn): Promise<void> {
    const turn = activeTurn.buildLiveTurn();
    if (!turn) return;

    await this.publishEvent({type: "session.turn", sessionId: this.sessionId, context: activeTurn.context, turn});
  }

  /** Waits for Pi to finish its public run-settlement boundary before publishing committed state. */
  private async waitForPiSettlement(): Promise<void> {
    await this.agentSession?.agent.waitForIdle();
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
