import {randomUUID} from "node:crypto";
import {diffRevisions} from "@earendil-works/chord/delta";
import type {JsonValue} from "@earendil-works/chord";
import type {SessionActivity, SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {Session} from "@supernova/contracts/sessions/schemas";
import type {CheckpointRef, CheckpointStatus} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {SessionFile} from "@supernova/agent-runtime/pi/session-file";
import type {SessionHistory, SessionStore} from "@supernova/agent-runtime/pi/session-store";
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

/** What a session is doing, from its `pi.live`. A manual compaction runs without a run, so it is listed on its own. */
function activityOf(session: Session): SessionActivity {
  if ((session.live.compactions ?? []).some((compaction) => compaction.blocking || compaction.reason === "manual")) return "compacting";
  return session.live.run === undefined ? "idle" : "running";
}

/**
 * Publishes one session's state and serializes its navigation commands. The engine owns execution and turn state; the
 * worker keeps the session document clients mirror and publishes each change to it as a Chord delta
 * (`session.state`), the same way the engine's replicated state reaches its own viewers.
 */
export class SessionWorker {
  public readonly resourceCache: ResourceCache;
  public readonly sessionId: string;
  public readonly sdk: Pick<PiSdk, "modelRuntime">;
  public readonly store: SessionStore;

  private readonly checkpointStore: CheckpointStore;
  private readonly eventBus: EventBus<SessionStreamEvent>;

  private revision = 0;
  private publishing: Promise<unknown> = Promise.resolve();
  private commandRunning = false;
  private cancelled = false;
  private watched: {readonly conversationId: number; readonly unsubscribe: () => void} | undefined;
  private readonly background = new Set<Promise<unknown>>();
  /** The document clients mirror and the histories it was built from; absent until first read or watched frame. */
  private document: {readonly session: Session; readonly history: SessionHistory} | undefined;

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

  /** The document clients apply `session.state` deltas to, after every change already published. */
  public async current(): Promise<Session> {
    await this.session();
    return this.enqueue(async () => this.document?.session ?? (await this.publish()));
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

  /** Publishes the session's summary after a title change, for project listings, and the change to its document. */
  public async publishSessionUpdate(): Promise<void> {
    const record = await this.store.record(this.sessionId);
    const session = await this.refresh();
    this.publishEvent({
      type: "session.updated",
      projectPath: record.projectPath,
      sessionId: this.sessionId,
      summary: {id: record.id, forked: session.forked, title: session.title, updatedAt: session.updatedAt, worktree: session.worktree !== undefined},
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
    // Frames only trigger a publication; it reads the current view, so a frame handled late never moves state back.
    const unsubscribe = await session.watch(visible, () => void this.enqueue(() => this.onFrame()).catch(() => undefined));
    this.watched = {conversationId: visible, unsubscribe};
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
   * Rebuilds the document and publishes the delta from the last one. The first build publishes nothing: no client can
   * hold an earlier version. Versions start at the build time, so a client holding a document from before a server
   * restart sees a gap and reloads instead of applying a delta to the wrong base.
   */
  private async publish(): Promise<Session> {
    const previous = this.document;
    const built = await this.store.snapshot(this.sessionId, {version: previous?.session.version ?? Date.now(), previous: previous?.history});
    if (!previous) {
      this.document = built;
      return built.session;
    }
    const ops = diffRevisions(previous.session as unknown as JsonValue, built.session as unknown as JsonValue);
    if (ops.length === 0) {
      this.document = {session: previous.session, history: built.history};
      return previous.session;
    }
    const version = previous.session.version + 1;
    const session = {...built.session, version};
    this.document = {session, history: built.history};
    this.publishEvent({type: "session.state", sessionId: this.sessionId, version, ops: [...ops, ["s", ["version"], version]], activity: activityOf(session)});
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
