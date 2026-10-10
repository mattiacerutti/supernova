import type {
  AbortSessionPayload,
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionSetupStep,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionBoard} from "@supernova/agent-runtime/features/session-runtime/worker/session-board";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import type {DocumentState} from "@supernova/agent-runtime/lib/document-state";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";

export interface SessionRuntimeDeps {
  readonly checkpointStore: CheckpointStore;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly store: SessionStore;
  readonly titleGenerator: TitleGenerator;
}

/**
 * Live session execution: sending, aborting, compacting, checkpoint navigation, and each session's state. Keeps one
 * `SessionWorker` per session in use; the engine owns execution, the workers publish it.
 */
export class SessionRuntime {
  /** Activity, summaries, setup steps, and problems of every session in use, for clients that have not attached one. */
  public readonly board = new SessionBoard();
  private readonly workers = new Map<string, Promise<SessionWorker>>();

  public constructor(private readonly deps: SessionRuntimeDeps) {}

  public async sendMessage(input: SendMessagePayload): Promise<void> {
    await (await this.worker(input.sessionId)).sendMessage(input);
  }

  public async compact(input: CompactSessionPayload): Promise<void> {
    await (await this.worker(input.sessionId)).compact(input);
  }

  /** Aborts the session's work if it has any; the session stays open. */
  public async abort(input: AbortSessionPayload): Promise<void> {
    await (await this.workers.get(input.sessionId)?.catch(() => undefined))?.abort();
  }

  public async undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    await (await this.worker(input.sessionId)).undoCheckpoint(input);
  }

  public async redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    await (await this.worker(input.sessionId)).redoCheckpoint(input);
  }

  public async revertToMessage(input: RevertToMessagePayload): Promise<void> {
    await (await this.worker(input.sessionId)).revertToMessage(input);
  }

  /** A durable session's document at its latest published revision. */
  public async current(sessionId: string): Promise<Session> {
    return (await this.worker(sessionId)).current();
  }

  /** A durable session's document as replicated state, for attached clients. */
  public async transcript(sessionId: string): Promise<DocumentState<Session>> {
    return (await this.worker(sessionId)).document;
  }

  /** Rebuilds a session's document after a change outside the engine (a rename) and publishes it. */
  public async refresh(sessionId: string): Promise<Session> {
    return (await this.worker(sessionId)).refresh();
  }

  /** Open sessions reinstall extensions from disk; an active turn finishes on the code it started with. */
  public reloadExtensions(): Promise<void> {
    return this.deps.store.reload();
  }

  /** Marks the setup step of a session being created under `projectPath`, or its end; see `SessionSetupStep`. */
  public setSetupStep(input: {readonly projectPath: string; readonly sessionId: string; readonly step: SessionSetupStep | null}): void {
    this.board.update(input.sessionId, input.projectPath, {setupStep: input.step});
  }

  /** Reports a problem that did not fail a command, such as an extension diagnostic; clients show it until the next run. */
  public reportError(sessionId: string, error: string): void {
    void this.deps.store.find(sessionId).then((record) => {
      if (record) this.board.update(sessionId, record.projectPath, {error: {message: error, at: new Date().toISOString()}});
    });
  }

  /** Stops the session's work, closes it, and drops its checkpoints; used before a session is archived. `workspacePath` is where the agent ran. */
  public async release(input: {readonly sessionId: string; readonly workspacePath: string}): Promise<void> {
    const pending = this.workers.get(input.sessionId);
    this.workers.delete(input.sessionId);
    const worker = await pending?.catch(() => undefined);
    await worker?.abort();
    await worker?.dispose();
    this.board.remove(input.sessionId);
    await this.deps.store.release(input.sessionId);
    await this.deps.checkpointStore.deleteSession({projectRoot: input.workspacePath, sessionId: input.sessionId});
  }

  /** Stops every worker and closes every session file; interrupted work resumes at the next start. */
  public async dispose(): Promise<void> {
    const workers = await Promise.all([...this.workers.values()].map((pending) => pending.catch(() => undefined)));
    this.workers.clear();
    await Promise.all(workers.map((worker) => worker?.dispose()));
    await this.deps.store.dispose();
  }

  /** The worker of a session, opened once; unknown ids fail. A failed open is retried by the next call. */
  private worker(sessionId: string): Promise<SessionWorker> {
    let pending = this.workers.get(sessionId);
    if (!pending) {
      const {checkpointStore, resourceCache, sdk, store, titleGenerator} = this.deps;
      pending = SessionWorker.open({board: this.board, checkpointStore, resourceCache, sdk, sessionId, store, titleGenerator});
      pending.catch(() => this.workers.delete(sessionId));
      this.workers.set(sessionId, pending);
    }
    return pending;
  }
}
