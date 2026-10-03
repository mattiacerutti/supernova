import type {
  AbortSessionPayload,
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionSetupStep,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
import type {Session} from "@supernova/contracts/sessions/schemas";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {compactSession} from "@supernova/agent-runtime/features/session-runtime/worker/commands/compact-session";
import {redoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/redo-checkpoint";
import {revertToMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/revert-to-message";
import {sendMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/send-message";
import {undoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/undo-checkpoint";
import {SessionBoard} from "@supernova/agent-runtime/features/session-runtime/worker/session-board";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import type {DocumentState} from "@supernova/agent-runtime/lib/document-state";
import {LegacySessionError, isLegacySession} from "@supernova/agent-runtime/pi/lib/session/legacy-sessions";
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

  public async undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    await undoCheckpoint(await this.worker(input.sessionId), input);
  }

  public async redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    await redoCheckpoint(await this.worker(input.sessionId), input);
  }

  public async revertToMessage(input: RevertToMessagePayload): Promise<void> {
    await revertToMessage(await this.worker(input.sessionId), input);
  }

  /** A durable session's document at its latest published revision. */
  public async current(sessionId: string): Promise<Session> {
    return (await this.worker(sessionId)).current();
  }

  /** A durable session's document as replicated state, for attached clients. */
  public async transcript(sessionId: string): Promise<DocumentState<Session>> {
    return (await this.worker(sessionId)).transcript();
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

  /** Reports a problem that did not fail a command, such as an extension diagnostic. */
  public reportError(sessionId: string, error: string): void {
    this.workerFor(sessionId).reportError(error);
  }

  /** Stops the session's work, closes it, and drops its checkpoints; used before a session is archived. `workspacePath` is where the agent ran. */
  public async release(input: {readonly sessionId: string; readonly workspacePath: string}): Promise<void> {
    const worker = this.workers.get(input.sessionId);
    this.workers.delete(input.sessionId);
    await worker?.abort();
    await worker?.dispose();
    this.board.remove(input.sessionId);
    await this.deps.store.release(input.sessionId);
    await this.deps.checkpointStore.deleteSession({projectRoot: input.workspacePath, sessionId: input.sessionId});
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
      const {checkpointStore, resourceCache, sdk, store} = this.deps;
      worker = new SessionWorker({board: this.board, checkpointStore, resourceCache, sdk, sessionId, store});
      this.workers.set(sessionId, worker);
    }
    return worker;
  }
}
