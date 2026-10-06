import {randomUUID} from "node:crypto";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {CheckpointConflictError} from "@supernova/contracts/services/session-runtime/procedures";
import type {
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionActivity,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
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
import {DocumentState} from "@supernova/agent-runtime/lib/document-state";

export interface SessionWorkerInput {
  readonly board: SessionBoard;
  readonly checkpointStore: CheckpointStore;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly sessionId: string;
  readonly store: SessionStore;
  readonly titleGenerator: TitleGenerator;
}

/** What a session is doing, from its `pi.live`. A manual compaction runs without a run, so it is listed on its own. */
function activityOf(session: Session): SessionActivity {
  if ((session.live.compactions ?? []).some((compaction) => compaction.blocking || compaction.reason === "manual")) return "compacting";
  return session.live.run === undefined ? "idle" : "running";
}

/**
 * The live runtime of one open session: runs its commands one at a time, publishes its document as Chord replicated
 * state (subscribers receive each change as a delta), captures after-turn checkpoints, and reports activity and
 * problems to the session board. The engine owns execution; the worker follows it.
 */
export class SessionWorker {
  /** The document clients mirror, current after every published change. */
  public readonly document: DocumentState<Session>;
  // What the commands in `commands/` run with, besides the methods below.
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
    /** The open session file. */
    public readonly file: SessionFile,
    document: DocumentState<Session>
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

  /** Opens the session's file and builds its first document. */
  public static async open(input: SessionWorkerInput): Promise<SessionWorker> {
    const file = await input.store.file(input.sessionId);
    const session = await file.snapshot(await SessionWorker.record(input));
    return new SessionWorker(input, file, new DocumentState(session));
  }

  public async sendMessage(input: SendMessagePayload): Promise<void> {
    if (this.commandRunning) throw new Error("Session already has active work.");
    this.cancelled = false;
    await sendMessage(this, input);
  }

  /** Manually compacts the context without a user turn; its progress reaches clients through `pi.live.compactions`. */
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

  /** Stops the session's user-facing work: a send's preparation, the run, and queued inputs. */
  public async abort(): Promise<void> {
    this.cancelled = true;
    await this.file.abort();
  }

  /** The document after every change already queued has been published. */
  public async current(): Promise<Session> {
    await this.enqueue(async () => undefined);
    return this.document.value;
  }

  /** Rebuilds the document from the session file and publishes the change, for changes no engine frame shows. */
  public refresh(): Promise<Session> {
    return this.enqueue(() => this.publish());
  }

  /** Reports a problem that did not fail a command; clients show it until the next run. */
  public reportError(message: string): void {
    void SessionWorker.record(this.input).then(
      (record) => this.input.board.update(this.input.sessionId, record.projectPath, {error: {message, at: new Date().toISOString()}}),
      () => undefined
    );
  }

  /**
   * Captures a workspace checkpoint of the session's working directory, or records a disabled one when `capture` is
   * false. Best-effort: a failure leaves the boundary uncovered instead of failing the turn, so provider work is never
   * blocked by checkpoint storage.
   */
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

  /** Restores only files changed between checkpoints, leaving Git HEAD and staged state untouched. */
  public async restoreCheckpoint(input: {readonly checkpointId: string; readonly force: boolean; readonly fromCheckpointId: string | undefined}): Promise<void> {
    try {
      await this.input.checkpointStore.restore({...input, projectRoot: this.file.cwd, sessionId: this.input.sessionId});
    } catch (cause) {
      if (cause instanceof CheckpointConflictError) throw cause;
      throw new Error("Failed to restore workspace checkpoint.");
    }
  }

  /** Whether an abort arrived since the current command started; a send checks it before submitting. */
  public isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Runs `work` in the publication queue and publishes after it: the engine places an input in one commit and its turn
   * record follows in another, and no state may be published between them.
   */
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

  /** Runs background work owned by the session (title generation) so disposal waits for it. */
  public track(work: Promise<unknown>): void {
    const tracked = work.catch(() => undefined).finally(() => this.background.delete(tracked));
    this.background.add(tracked);
  }

  /** Stops following the session and waits for its background work; the engine keeps the session's run going. */
  public async dispose(): Promise<void> {
    this.stopWatching();
    await Promise.all([...this.background, this.publishing]);
    this.document.dispose();
  }

  private static async record(input: SessionWorkerInput) {
    const record = await input.store.find(input.sessionId);
    if (!record) throw new Error("Session not found.");
    return record;
  }

  /**
   * Runs a navigation or compaction command alone: rejects when another command or a run is active, so navigation never
   * races a turn. Sends are gated by the engine instead, which rejects one while a run is active.
   */
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

  /**
   * Publishes the current state; when no run is active, captures the after-turn checkpoint of turns that lack one. A
   * run may start and end between two frames, so settlement follows idle state rather than a seen transition.
   */
  private async onFrame(): Promise<void> {
    const session = await this.publish();
    if (session.live.run === undefined) await this.settleTurns();
  }

  /**
   * Rebuilds the document and publishes the change from the last one; the board follows its activity and summary. A
   * new run clears the last reported problem.
   */
  private async publish(): Promise<Session> {
    const session = await this.file.snapshot(await SessionWorker.record(this.input));
    this.document.publish(session, BACKGROUND_CONTEXT);
    const activity = activityOf(session);
    const summary = {
      id: session.id,
      forked: session.forked,
      pinned: session.pinned,
      title: session.title,
      updatedAt: session.updatedAt,
      worktree: session.worktree !== undefined,
    };
    this.input.board.update(this.input.sessionId, session.projectPath, {activity, summary, ...(activity === "running" ? {error: null, setupStep: null} : {})});
    return session;
  }

  /**
   * Captures the after-turn checkpoint of every turn whose run ended without one: one capture serves all inputs a run
   * answered. Also catches up on runs that finished after a restart, before anything watched them.
   */
  private async settleTurns(): Promise<void> {
    const {turnIds, capture} = await this.file.unsettledTurns();
    if (turnIds.length === 0) return;
    await this.file.settleTurns(turnIds, await this.captureCheckpoint(capture));
  }

  /** Runs publications in order; a failed one never blocks later ones and is reported. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.publishing.then(work);
    this.publishing = run.catch((error) => this.reportError(error instanceof Error ? error.message : "Failed to publish session state."));
    return run;
  }
}
