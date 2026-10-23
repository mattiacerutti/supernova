import {randomUUID} from "node:crypto";
import type {MutableReplicatedState} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {
  CompactSessionPayload,
  LoadHistoryPayload,
  LoadHistoryResult,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import {CheckpointConflictError, sessionActivityOf} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {CheckpointRef, CheckpointStatus} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {findSelectedModel} from "@supernova/agent-runtime/pi/lib/models/selected-model";
import {toPiThinkingLevel} from "@supernova/agent-runtime/pi/lib/models/thinking-levels";
import type {SessionFile} from "@supernova/agent-runtime/pi/session-file";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {redoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/redo-checkpoint";
import {revertToMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/revert-to-message";
import {sendMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/send-message";
import {undoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/undo-checkpoint";
import type {SessionBoard} from "@supernova/agent-runtime/features/session-runtime/worker/session-board";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";

export interface SessionWorkerInput {
  readonly board: SessionBoard;
  readonly checkpointStore: CheckpointStore;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly sessionId: string;
  readonly store: SessionStore;
  readonly titleGenerator: TitleGenerator;
}

export class SessionWorker {
  public readonly document: MutableReplicatedState<Session>;
  public readonly store: SessionStore;
  public readonly sdk: Pick<PiSdk, "modelRuntime">;
  public readonly resourceCache: ResourceCache;
  public readonly titleGenerator: TitleGenerator;

  private publishing: Promise<unknown> = Promise.resolve();
  private commandRunning = false;
  private cancelled = false;
  private readonly background = new Set<Promise<unknown>>();
  private readonly stopWatching: () => void;

  private constructor(
    private readonly input: SessionWorkerInput,
    public readonly file: SessionFile,
    document: MutableReplicatedState<Session>
  ) {
    this.document = document;
    this.store = input.store;
    this.sdk = input.sdk;
    this.resourceCache = input.resourceCache;
    this.titleGenerator = input.titleGenerator;
    // Frames only trigger a publication; it reads the current state, so a frame handled late never moves it back.
    this.stopWatching = file.watch(() => void this.enqueue(() => this.onFrame()).catch(() => undefined));
    // Catches up on runs that finished after a restart, before anything watched them.
    void this.enqueue(() => this.onFrame()).catch(() => undefined);
  }

  public static async open(input: SessionWorkerInput): Promise<SessionWorker> {
    const file = await input.store.file(input.sessionId);
    const session = await file.snapshot(await SessionWorker.record(input));
    return new SessionWorker(input, file, replicatedState(session));
  }

  public async sendMessage(input: SendMessagePayload): Promise<void> {
    if (this.commandRunning) throw new Error("Session already has active work.");
    this.cancelled = false;
    await sendMessage(this, input);
  }

  public compact(input: CompactSessionPayload): Promise<void> {
    return this.command(async () => {
      try {
        const model = findSelectedModel(this.input.sdk, input.modelReference);
        await this.file.compact({provider: model.provider, modelId: model.id, thinkingLevel: toPiThinkingLevel(input.modelReference.thinkingLevel)});
      } catch (cause) {
        this.reportError(cause instanceof Error ? cause.message : "Failed to compact session.");
      }
    });
  }

  public undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    return this.command(() => undoCheckpoint(this, input));
  }

  public redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    return this.command(() => redoCheckpoint(this, input));
  }

  public revertToMessage(input: RevertToMessagePayload): Promise<void> {
    return this.command(() => revertToMessage(this, input));
  }

  public loadHistory(input: Omit<LoadHistoryPayload, "sessionId">): Promise<LoadHistoryResult> {
    return this.file.historyPage(input);
  }

  public async abort(): Promise<void> {
    this.cancelled = true;
    await this.file.abort();
  }

  public async current(): Promise<Session> {
    await this.enqueue(async () => undefined);
    return this.document.value;
  }

  public refresh(): Promise<Session> {
    return this.enqueue(() => this.publish());
  }

  public reportError(message: string): void {
    void SessionWorker.record(this.input).then(
      (record) => this.input.board.notify(this.input.sessionId, record.projectPath, {level: "error", message}),
      () => undefined
    );
  }

  /** Best-effort: a failed capture leaves the boundary uncovered rather than failing the turn. */
  public async captureCheckpoint(capture: boolean): Promise<CheckpointRef> {
    const checkpointId = randomUUID();
    const {sessionId} = this.input;
    const status: CheckpointStatus = !capture
      ? "disabled"
      : await this.input.checkpointStore
          .capture({checkpointId, projectRoot: this.file.cwd, sessionId})
          .then(() => "captured" as const)
          .catch(() => "failed" as const);
    return {checkpointId, sessionId, status};
  }

  public async restoreCheckpoint(input: {readonly checkpointId: string; readonly force: boolean; readonly fromCheckpointId: string | undefined}): Promise<void> {
    try {
      await this.input.checkpointStore.restore({...input, projectRoot: this.file.cwd, sessionId: this.input.sessionId});
    } catch (cause) {
      if (cause instanceof CheckpointConflictError) throw cause;
      throw new Error("Failed to restore workspace checkpoint.");
    }
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  /** The engine places an input and its turn record in separate commits; nothing may publish between them. */
  public async publishAfter<T>(work: () => Promise<T>): Promise<T> {
    const outcome = await this.enqueue(async () => {
      const result = await work().then(
        (value) => ({value}),
        (error: unknown) => ({error})
      );
      await this.publish();
      return result;
    });
    if ("error" in outcome) throw outcome.error;
    return outcome.value;
  }

  public track(work: Promise<unknown>): void {
    const tracked = work.catch(() => undefined).finally(() => this.background.delete(tracked));
    this.background.add(tracked);
  }

  public async dispose(): Promise<void> {
    this.stopWatching();
    await Promise.all([...this.background, this.publishing]);
  }

  private static async record(input: SessionWorkerInput) {
    const record = await input.store.find(input.sessionId);
    if (!record) throw new Error("Session not found.");
    return record;
  }

  /** Navigation never races a turn. Sends are gated by the engine itself. */
  private async command(run: () => Promise<void>): Promise<void> {
    if (this.commandRunning) throw new Error("Session already has active work.");
    this.commandRunning = true;
    this.cancelled = false;
    try {
      if (await this.file.isRunning()) throw new Error("Session already has active work.");
      await run();
    } finally {
      this.commandRunning = false;
    }
  }

  /** A run may start and end between two frames, so settlement follows idle state, not a seen transition. */
  private async onFrame(): Promise<void> {
    const session = await this.publish();
    if (session.live.run === undefined) await this.settleTurns();
  }

  private async publish(): Promise<Session> {
    const session = await this.file.snapshot(await SessionWorker.record(this.input));
    this.document.replace(BACKGROUND_CONTEXT, session);
    const activity = sessionActivityOf(session.live);
    const summary = {
      id: session.id,
      forked: session.forked,
      pinned: session.pinned,
      title: session.title,
      updatedAt: session.updatedAt,
      ...(session.worktree ? {worktree: session.worktree} : {}),
    };
    this.input.board.update(this.input.sessionId, session.projectPath, {activity, summary, ...(activity === "running" ? {setupStep: null} : {})});
    return session;
  }

  /** One capture serves every input a run answered, including runs that finished while nothing watched. */
  private async settleTurns(): Promise<void> {
    const {turnIds, capture} = await this.file.unsettledTurns();
    if (turnIds.length === 0) return;
    await this.file.settleTurns(turnIds, await this.captureCheckpoint(capture));
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.publishing.then(work);
    this.publishing = run.catch((error) => this.reportError(error instanceof Error ? error.message : "Failed to publish session state."));
    return run;
  }
}
