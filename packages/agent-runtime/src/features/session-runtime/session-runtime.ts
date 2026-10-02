import type {
  AbortSessionPayload,
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionSetupStep,
  SessionStreamEvent,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
import type {Session} from "@supernova/contracts/sessions/schemas";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {toCheckpointNavigationError} from "@supernova/agent-runtime/features/session-runtime/checkpoints/lib/checkpoint-error";
import {compactSession} from "@supernova/agent-runtime/features/session-runtime/worker/commands/compact-session";
import {redoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/redo-checkpoint";
import {revertToMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/revert-to-message";
import {sendMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/send-message";
import {undoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/undo-checkpoint";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import type {EventBus} from "@supernova/agent-runtime/lib/event-bus";
import {LegacySessionError, isLegacySession} from "@supernova/agent-runtime/pi/lib/session/legacy-sessions";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";

export interface SessionRuntimeDeps {
  readonly checkpointStore: CheckpointStore;
  readonly events: EventBus<SessionStreamEvent>;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly store: SessionStore;
  readonly titleGenerator: TitleGenerator;
}

/** `first`, then everything from `rest`. Returning the result closes `rest`. */
function prepend<T>(first: T, rest: AsyncGenerator<T, void, undefined>): AsyncGenerator<T, void, undefined> {
  let started = false;
  return {
    next: () => {
      if (started) return rest.next();
      started = true;
      return Promise.resolve({done: false, value: first});
    },
    return: () => rest.return(),
    throw: (error) => rest.throw(error),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/**
 * Live session execution: sending, aborting, compacting, checkpoint navigation, and the event stream. Keeps one
 * `SessionWorker` per session in use; the engine owns execution, the workers publish it.
 */
export class SessionRuntime {
  private readonly workers = new Map<string, SessionWorker>();

  public constructor(private readonly deps: SessionRuntimeDeps) {}

  public async sendMessage(input: SendMessagePayload): Promise<void> {
    await sendMessage(await this.worker(input.sessionId), this.deps.titleGenerator, input);
  }

  public async compact(input: CompactSessionPayload): Promise<void> {
    await compactSession(await this.worker(input.sessionId), input);
  }

  /** Aborts the session's work if it has any; the session stays open. */
  public async abort(input: AbortSessionPayload): Promise<void> {
    await this.workers.get(input.sessionId)?.abort();
  }

  /** Checkpoint navigation rejects with a `CheckpointNavigationError`; see `toCheckpointNavigationError`. */
  public async undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    await undoCheckpoint(await this.worker(input.sessionId), input).catch((cause: unknown) => {
      throw toCheckpointNavigationError(cause);
    });
  }

  public async redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    await redoCheckpoint(await this.worker(input.sessionId), input).catch((cause: unknown) => {
      throw toCheckpointNavigationError(cause);
    });
  }

  public async revertToMessage(input: RevertToMessagePayload): Promise<void> {
    await revertToMessage(await this.worker(input.sessionId), input).catch((cause: unknown) => {
      throw toCheckpointNavigationError(cause);
    });
  }

  /** The committed view of a session whose settled snapshot is not published yet, or undefined to read it normally. */
  public async getCommittedSession(input: {readonly sessionId: string}): Promise<Session | undefined> {
    return this.workers.get(input.sessionId)?.committedSession();
  }

  /** Open sessions reinstall extensions from disk; an active turn finishes on the code it started with. */
  public reloadExtensions(): Promise<void> {
    return this.deps.store.reload();
  }

  /** Marks a setup step of a session being created; see `SessionSetupStep`. */
  public publishSetup(input: {readonly phase: "started" | "ended"; readonly sessionId: string; readonly step: SessionSetupStep}): void {
    this.workerFor(input.sessionId).publishEvent({type: `session.setup.${input.phase}`, sessionId: input.sessionId, step: input.step});
  }

  /** Reports a problem that did not fail a command, such as an extension diagnostic. */
  public reportError(sessionId: string, error: string): void {
    this.workerFor(sessionId).publishEvent({type: "session.error", sessionId, error});
  }

  /** Stops the session's work, closes it, and drops its checkpoints; used before a session is archived. `workspacePath` is where the agent ran. */
  public async release(input: {readonly sessionId: string; readonly workspacePath: string}): Promise<void> {
    const worker = this.workers.get(input.sessionId);
    this.workers.delete(input.sessionId);
    await worker?.abort();
    await worker?.dispose();
    await this.deps.store.release(input.sessionId);
    await this.deps.checkpointStore.deleteSession({projectRoot: input.workspacePath, sessionId: input.sessionId});
  }

  /** A `connected` marker followed by every runtime event, until the consumer stops iterating. Subscribes immediately. */
  public watchEvents(): AsyncGenerator<SessionStreamEvent, void, undefined> {
    return prepend({type: "connected"}, this.deps.events.subscribe());
  }

  /** Stops every worker and closes every session file; interrupted work resumes at the next start. */
  public async dispose(): Promise<void> {
    await Promise.all([...this.workers.values()].map((worker) => worker.dispose()));
    this.workers.clear();
    await this.deps.store.dispose();
  }

  /** The worker of a durable session. Legacy sessions are read-only; unknown ids fail. */
  private async worker(sessionId: string): Promise<SessionWorker> {
    if (!(await this.deps.store.find(sessionId))) {
      if (await isLegacySession(sessionId)) throw new LegacySessionError();
      throw new Error("Session not found.");
    }
    return this.workerFor(sessionId);
  }

  private workerFor(sessionId: string): SessionWorker {
    let worker = this.workers.get(sessionId);
    if (!worker) {
      const {checkpointStore, events, resourceCache, sdk, store} = this.deps;
      worker = new SessionWorker({checkpointStore, eventBus: events, resourceCache, sdk, sessionId, store});
      this.workers.set(sessionId, worker);
    }
    return worker;
  }
}
