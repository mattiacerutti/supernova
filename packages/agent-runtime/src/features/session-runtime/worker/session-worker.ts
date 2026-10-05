import {randomUUID} from "node:crypto";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {CheckpointConflictError} from "@supernova/contracts/services/session-runtime/procedures";
import type {SessionActivity} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {CheckpointRef, CheckpointStatus} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {SessionFile} from "@supernova/agent-runtime/pi/session-file";
import type {NavigationState, SessionHistory, SessionStore} from "@supernova/agent-runtime/pi/session-store";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import type {SessionBoard} from "@supernova/agent-runtime/features/session-runtime/worker/session-board";
import {DocumentState} from "@supernova/agent-runtime/lib/document-state";

export interface SessionWorkerInput {
  readonly board: SessionBoard;
  readonly checkpointStore: CheckpointStore;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly sessionId: string;
  readonly store: SessionStore;
}

/** What a session is doing, from its `pi.live`. A manual compaction runs without a run, so it is listed on its own. */
function activityOf(session: Session): SessionActivity {
  if ((session.live.compactions ?? []).some((compaction) => compaction.blocking || compaction.reason === "manual")) return "compacting";
  return session.live.run === undefined ? "idle" : "running";
}

/**
 * Publishes one session's state and serializes its navigation commands. The engine owns execution and turn state; the
 * worker keeps the session document as Chord replicated state, whose subscribers receive each change as a delta, the
 * same way the engine's view state reaches its own viewers. Its activity and problems go to the session board.
 */
export class SessionWorker {
  public readonly resourceCache: ResourceCache;
  public readonly sessionId: string;
  public readonly sdk: Pick<PiSdk, "modelRuntime">;
  public readonly store: SessionStore;

  private readonly board: SessionBoard;
  private readonly checkpointStore: CheckpointStore;

  private publishing: Promise<unknown> = Promise.resolve();
  private commandRunning = false;
  private cancelled = false;
  private watched: {readonly conversationId: number; readonly unsubscribe: () => void} | undefined;
  private readonly background = new Set<Promise<unknown>>();
  /** The document clients mirror; absent until the session is first opened. */
  private document: DocumentState<Session> | undefined;
  /** The histories the document was built from. */
  private history: SessionHistory | undefined;

  public constructor(input: SessionWorkerInput) {
    this.board = input.board;
    this.checkpointStore = input.checkpointStore;
    this.store = input.store;
    this.resourceCache = input.resourceCache;
    this.sdk = input.sdk;
    this.sessionId = input.sessionId;
  }

  /** The session's open file, watched for events from the first use on. */
  public async session(): Promise<SessionFile> {
    const session = await this.store.file(this.sessionId);
    await this.watch(session);
    return session;
  }

  /** The session document after every change already published. */
  public async current(): Promise<Session> {
    return (await this.transcript()).value;
  }

  /** The session document as replicated state, built on first use. */
  public async transcript(): Promise<DocumentState<Session>> {
    await this.session();
    await this.enqueue(async () => {
      if (!this.document) await this.publish();
    });
    return this.document!;
  }

  /** The session's turns for undo, redo, and revert, from the history the document was last built from. */
  public async navigation(): Promise<NavigationState> {
    await this.session();
    return this.enqueue(() => this.store.navigation(this.sessionId, this.history));
  }

  /** Rebuilds the document from the session file and publishes the change, for changes no engine frame shows. */
  public async refresh(): Promise<Session> {
    await this.session();
    return this.enqueue(() => this.publish());
  }

  /**
   * Runs a submission inside the publication queue and publishes after it: the engine places the input in one commit
   * and its turn record follows in another, and no state may be published between them, or clients would show the user
   * entry without its record.
   */
  public async submit<T>(work: () => Promise<T>): Promise<T> {
    await this.session();
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

  /**
   * Marks a navigation or compaction command as running; sends are rejected by the engine while a run is active.
   * Rejects when another command or a run is active, so navigation never races a turn.
   */
  public async beginWork(): Promise<SessionFile> {
    if (this.commandRunning) throw new Error("Session already has active work.");
    this.commandRunning = true;
    this.cancelled = false;
    try {
      const session = await this.session();
      if ((await session.view()).docs["pi.live"]?.run !== undefined) throw new Error("Session already has active work.");
      return session;
    } catch (error) {
      this.commandRunning = false;
      throw error;
    }
  }

  public endWork(): void {
    this.commandRunning = false;
  }

  /** Starts a send's preparation; an abort before the input is submitted cancels it. */
  public beginSend(): void {
    if (this.commandRunning) throw new Error("Session already has active work.");
    this.cancelled = false;
  }

  /** Stops the user-facing work of this session: preparation, the run, and queued inputs. */
  public async abort(): Promise<void> {
    this.cancelled = true;
    if (!this.store.isOpen(this.sessionId)) return;
    await (await this.session()).abort();
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  /** Reports a problem that did not fail a command; clients show it until the next run. */
  public reportError(message: string): void {
    void this.store.find(this.sessionId).then((record) => {
      if (record) this.board.update(this.sessionId, record.projectPath, {error: {message, at: new Date().toISOString()}});
    });
  }

  /**
   * Captures a workspace checkpoint of this session's working directory. Best-effort: a failure leaves the boundary
   * uncovered instead of failing the turn, so provider work is never blocked by checkpoint storage.
   */
  public async createCheckpoint(capture: boolean): Promise<CheckpointRef> {
    const checkpointId = randomUUID();
    const status: CheckpointStatus = !capture
      ? "disabled"
      : await this.checkpointStore
          .capture({checkpointId, projectRoot: await this.store.cwd(this.sessionId), sessionId: this.sessionId})
          .then(() => "captured" as const)
          .catch(() => "failed" as const);
    return {checkpointId, sessionId: this.sessionId, status};
  }

  /** Restores only files changed between checkpoints, leaving Git HEAD and staged state untouched. */
  public async restoreCheckpoint(input: {readonly checkpointId: string; readonly force: boolean; readonly fromCheckpointId: string | undefined}): Promise<void> {
    try {
      await this.checkpointStore.restore({...input, projectRoot: await this.store.cwd(this.sessionId), sessionId: this.sessionId});
    } catch (cause) {
      if (cause instanceof CheckpointConflictError) throw cause;
      throw new Error("Failed to restore workspace checkpoint.");
    }
  }

  /** Forks at the leaf before the agent acts (see `SessionFile.diverge`) and follows the new branch. */
  public async diverge(session: SessionFile): Promise<void> {
    await session.diverge();
    await this.watch(session);
  }

  /** Runs background work owned by this session (title generation) so disposal can wait for it. */
  public track(work: Promise<unknown>): void {
    const tracked = work.catch(() => undefined).finally(() => this.background.delete(tracked));
    this.background.add(tracked);
  }

  /** Stops watching and waits for background work; the engine keeps the session's run going. */
  public async dispose(): Promise<void> {
    this.watched?.unsubscribe();
    this.watched = undefined;
    await Promise.all([...this.background, this.publishing]);
    this.document?.dispose();
  }

  private async watch(session: SessionFile): Promise<void> {
    const {branch} = await session.state();
    if (this.watched?.conversationId === branch) return;
    this.watched?.unsubscribe();
    // Frames only trigger a publication; it reads the current view, so a frame handled late never moves state back.
    const unsubscribe = await session.watch(branch, () => void this.enqueue(() => this.onFrame()).catch(() => undefined));
    this.watched = {conversationId: branch, unsubscribe};
    // Also catches up on runs that finished after a restart, before anything watched them.
    void this.enqueue(() => this.onFrame()).catch(() => undefined);
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
    const {session, history} = await this.store.snapshot(this.sessionId, {previous: this.history});
    this.history = history;
    if (this.document) this.document.publish(session, BACKGROUND_CONTEXT);
    else this.document = new DocumentState(session);
    const activity = activityOf(session);
    const summary = {
      id: session.id,
      forked: session.forked,
      pinned: session.pinned,
      title: session.title,
      updatedAt: session.updatedAt,
      worktree: session.worktree !== undefined,
    };
    this.board.update(this.sessionId, session.projectPath, {activity, summary, ...(activity === "running" ? {error: null, setupStep: null} : {})});
    return session;
  }

  /**
   * Captures the after-turn checkpoint of every turn whose run ended without one: one capture serves all inputs a run
   * answered. Also catches up on runs that finished after a restart, before anything watched them.
   */
  private async settleTurns(): Promise<void> {
    const session = await this.store.file(this.sessionId);
    const {turns} = await session.state();
    const open = Object.entries(turns).filter(([, record]) => record.after === undefined);
    if (open.length === 0) return;
    const after = await this.createCheckpoint(open.some(([, record]) => record.capture));
    await session.updateState((draft) => {
      for (const [turnId, record] of open) draft.turns[turnId] = {...record, after: record.capture ? after : {...after, status: "disabled"}};
      draft.current = after;
    });
  }

  /** Runs publications in order; a failed one never blocks later ones and is reported. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.publishing.then(work);
    this.publishing = run.catch((error) => this.reportError(error instanceof Error ? error.message : "Failed to publish session state."));
    return run;
  }
}
