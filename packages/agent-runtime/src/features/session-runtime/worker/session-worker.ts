import {randomUUID} from "node:crypto";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {Session} from "@supernova/contracts/sessions/schemas";
import type {CheckpointRef, CheckpointStatus} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {ConversationSnapshot, SessionFile} from "@supernova/agent-runtime/pi/session-file";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {CheckpointConflictError} from "@supernova/agent-runtime/features/session-runtime/checkpoints/shadow-repository";
import type {EventBus} from "@supernova/agent-runtime/lib/event-bus";

type RevisionedSessionStreamEvent = Extract<SessionStreamEvent, {readonly revision: number}>;
type UnrevisionedSessionStreamEvent = RevisionedSessionStreamEvent extends infer Event ? (Event extends {readonly revision: number} ? Omit<Event, "revision"> : never) : never;

export interface SessionWorkerInput {
  readonly checkpointStore: CheckpointStore;
  readonly eventBus: EventBus<SessionStreamEvent>;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly sessionId: string;
  readonly store: SessionStore;
}

/**
 * Publishes one session's events and serializes its navigation commands. The engine owns execution and turn state;
 * the worker watches the visible conversation and translates its committed views into the event stream:
 * `session.agent.*` from run transitions, `session.turn` while a run is active, `session.snapshot` when it settles.
 */
export class SessionWorker {
  public readonly resourceCache: ResourceCache;
  public readonly sessionId: string;
  public readonly sdk: Pick<PiSdk, "modelRuntime">;
  public readonly store: SessionStore;

  private readonly checkpointStore: CheckpointStore;
  private readonly eventBus: EventBus<SessionStreamEvent>;

  private revision = 0;
  private publishing: Promise<void> = Promise.resolve();
  private commandRunning = false;
  private cancelled = false;
  private watched: {readonly conversationId: number; readonly unsubscribe: () => void} | undefined;
  private readonly background = new Set<Promise<unknown>>();
  /**
   * The first user entry of the run being published, from the send that placed it or the first frame that shows it
   * (a run resumed after a restart). It is the committed/live boundary: committed reads end before it until the run's
   * settled snapshot is published, because the engine may end a fast run before any frame of it arrives.
   */
  private runStart: number | undefined;
  /** The last entry a settled snapshot covered; a send that returns after its run already settled is not reopened. */
  private settledThrough = 0;
  private wasCompacting = false;
  private lastTurnJson: string | undefined;

  public constructor(input: SessionWorkerInput) {
    this.checkpointStore = input.checkpointStore;
    this.store = input.store;
    this.eventBus = input.eventBus;
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
      if ((await session.view()).live?.run !== undefined) throw new Error("Session already has active work.");
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

  /** Publishes a public runtime event with a fresh revision. */
  public publishEvent(event: UnrevisionedSessionStreamEvent): void {
    this.eventBus.publish({...event, revision: this.nextRevision()} as RevisionedSessionStreamEvent);
  }

  /** Publishes the committed session; ordered with the view-driven events. */
  public publishSessionSnapshot(): Promise<void> {
    return this.enqueue(async () => {
      this.publishEvent({type: "session.snapshot", sessionId: this.sessionId, session: await this.store.snapshot(this.sessionId)});
    });
  }

  /**
   * Marks a run as started from the moment its input was placed, before any frame of it arrives: the engine may
   * finish a fast run within one frame, and committed reads must leave it out until its snapshot is published.
   */
  public markRunStarted(entryId: number): void {
    if (this.runStart !== undefined || entryId <= this.settledThrough) return;
    this.runStart = entryId;
    this.publishEvent({type: "session.agent.started", sessionId: this.sessionId});
  }

  /**
   * The committed session while this worker's view of a run has not settled: the engine may already have ended the
   * run, but until the settled snapshot is published the client still shows it live, so committed reads leave it out.
   */
  public async committedSession(): Promise<Session | undefined> {
    return this.runStart === undefined ? undefined : this.store.snapshot(this.sessionId, {before: this.runStart});
  }

  /** Publishes the session's summary after a title change. */
  public async publishSessionUpdate(): Promise<void> {
    const record = await this.store.record(this.sessionId);
    this.publishEvent({
      type: "session.updated",
      projectPath: record.projectPath,
      sessionId: this.sessionId,
      summary: {
        id: record.id,
        forked: record.forkedFrom !== undefined,
        title: record.title ?? (await this.store.snapshot(this.sessionId)).title,
        updatedAt: record.updatedAt,
        worktree: record.worktree !== undefined,
      },
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

  /** Follows the visible conversation after navigation moved it. */
  public async refreshWatch(): Promise<void> {
    await this.watch(await this.store.file(this.sessionId));
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
  }

  private async watch(session: SessionFile): Promise<void> {
    const {visible} = await session.state();
    if (this.watched?.conversationId === visible) return;
    this.watched?.unsubscribe();
    const first = this.watched === undefined;
    const unsubscribe = await session.watch(visible, (view) => void this.enqueue(() => this.onView(view)));
    this.watched = {conversationId: visible, unsubscribe};
    if (first && (await session.view()).live?.run === undefined) void this.enqueue(() => this.settleTurns());
  }

  /**
   * Translates one committed view into events: `session.agent.started` once per run, `session.turn` when the live
   * turn changed, compaction phases, and, on the first frame after the run's input that shows no run,
   * `session.agent.ended` and the settled `session.snapshot`. Frames may be coalesced, so a run can start and end in
   * one frame; it is still announced, shown, and settled in that order.
   */
  private async onView(view: ConversationSnapshot): Promise<void> {
    if (view.conversationId !== this.watched?.conversationId) return;
    const live = await this.store.live(this.sessionId, view, this.runStart);
    if (live.busy && this.runStart === undefined) this.markRunStarted(live.runStart!);
    if (live.compacting !== this.wasCompacting) this.publishEvent({type: live.compacting ? "session.compaction.started" : "session.compaction.ended", sessionId: this.sessionId});
    this.wasCompacting = live.compacting;
    if (live.turn) {
      const json = JSON.stringify([live.turn, live.context]);
      if (json !== this.lastTurnJson) this.publishEvent({type: "session.turn", sessionId: this.sessionId, context: live.context, turn: live.turn});
      this.lastTurnJson = json;
    }
    const frameEnd = view.entries.at(-1)?.id ?? 0;
    // A frame from before the run's input (delivered late) does not settle it.
    if (live.busy || this.runStart === undefined || frameEnd < this.runStart) return;
    this.lastTurnJson = undefined;
    this.publishEvent({type: "session.agent.ended", sessionId: this.sessionId});
    await this.settleTurns();
    const session = await this.store.snapshot(this.sessionId);
    // Cleared together with publishing, so no committed read sees the run before the client gets the snapshot.
    this.runStart = undefined;
    this.settledThrough = Math.max(this.settledThrough, frameEnd);
    this.publishEvent({type: "session.snapshot", sessionId: this.sessionId, session});
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

  /** Runs publications in order; a failed one never blocks later ones. */
  private enqueue(work: () => Promise<void>): Promise<void> {
    const run = this.publishing.then(work);
    this.publishing = run.catch((error) => {
      this.publishEvent({type: "session.error", sessionId: this.sessionId, error: error instanceof Error ? error.message : "Failed to publish session state."});
    });
    return run;
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }
}
