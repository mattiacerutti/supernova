import type {ProjectSessionArchivePayload} from "@supernova/contracts/projects/procedures";
import type {
  AbortSessionPayload,
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionStreamEvent,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
import type {GetSessionPayload} from "@supernova/contracts/sessions/procedures";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {toCheckpointNavigationError} from "@supernova/agent-runtime/features/session-runtime/checkpoints/lib/checkpoint-error";
import type {SessionPool} from "@supernova/agent-runtime/features/session-runtime/worker/session-pool";
import type {EventBus} from "@supernova/agent-runtime/lib/event-bus";

export interface SessionRuntimeDeps {
  readonly events: EventBus<SessionStreamEvent>;
  readonly pool: SessionPool;
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

/** Live session execution: sending, aborting, compacting, checkpoint navigation, and the event stream. */
export class SessionRuntime {
  public constructor(private readonly deps: SessionRuntimeDeps) {}

  public sendMessage(input: SendMessagePayload): Promise<void> {
    return this.deps.pool.sendMessage(input);
  }

  public compact(input: CompactSessionPayload): Promise<void> {
    return this.deps.pool.compactSession(input);
  }

  public abort(input: AbortSessionPayload): Promise<void> {
    return this.deps.pool.abortSession(input.sessionId);
  }

  /** Checkpoint navigation rejects with a `CheckpointNavigationError`; see `toCheckpointNavigationError`. */
  public undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    return this.deps.pool.undoCheckpoint(input).catch((cause: unknown) => {
      throw toCheckpointNavigationError(cause);
    });
  }

  public redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    return this.deps.pool.redoCheckpoint(input).catch((cause: unknown) => {
      throw toCheckpointNavigationError(cause);
    });
  }

  public revertToMessage(input: RevertToMessagePayload): Promise<void> {
    return this.deps.pool.revertToMessage(input).catch((cause: unknown) => {
      throw toCheckpointNavigationError(cause);
    });
  }

  /** The frozen committed view of a session whose Pi branch is mutating, or undefined when no runtime holds it. */
  public getCommittedSession(input: GetSessionPayload): Session | undefined {
    return this.deps.pool.getCommittedSession(input.sessionId);
  }

  /** Retained sessions reload extensions at their next command; an active turn finishes on the code it started with. */
  public reloadExtensions(): void {
    this.deps.pool.reloadExtensions();
  }

  /** Drops the retained runtime and its checkpoints; used before a session is archived. */
  public async release(input: ProjectSessionArchivePayload): Promise<void> {
    await this.deps.pool.releaseSession(input.sessionId);
    await this.deps.pool.deleteSessionCheckpoints(input.projectPath, input.sessionId);
  }

  /** A `connected` marker followed by every runtime event, until the consumer stops iterating. Subscribes immediately. */
  public watchEvents(): AsyncGenerator<SessionStreamEvent, void, undefined> {
    return prepend({type: "connected"}, this.deps.events.subscribe());
  }
}
