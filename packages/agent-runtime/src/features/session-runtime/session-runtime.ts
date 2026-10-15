import type {MutableReplicatedState} from "@earendil-works/chord";
import type {
  AbortSessionPayload,
  CompactSessionPayload,
  LoadHistoryPayload,
  LoadHistoryResult,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionNotice,
  SessionSetupStep,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionBoard} from "@supernova/agent-runtime/features/session-runtime/worker/session-board";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
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

export class SessionRuntime {
  public readonly board = new SessionBoard();
  private readonly workers = new Map<string, Promise<SessionWorker>>();

  public constructor(private readonly deps: SessionRuntimeDeps) {}

  public async sendMessage(input: SendMessagePayload): Promise<void> {
    await (await this.worker(input.sessionId)).sendMessage(input);
  }

  public async compact(input: CompactSessionPayload): Promise<void> {
    await (await this.worker(input.sessionId)).compact(input);
  }

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

  public async loadHistory(input: LoadHistoryPayload): Promise<LoadHistoryResult> {
    return (await this.worker(input.sessionId)).loadHistory(input);
  }

  public async current(sessionId: string): Promise<Session> {
    return (await this.worker(sessionId)).current();
  }

  public async transcript(sessionId: string): Promise<MutableReplicatedState<Session>> {
    return (await this.worker(sessionId)).document;
  }

  public async refresh(sessionId: string): Promise<Session> {
    return (await this.worker(sessionId)).refresh();
  }

  public reloadExtensions(): Promise<void> {
    return this.deps.store.reload();
  }

  public setSetupStep(input: {readonly projectPath: string; readonly sessionId: string; readonly step: SessionSetupStep | null}): void {
    this.board.update(input.sessionId, input.projectPath, {setupStep: input.step});
  }

  public notify(sessionId: string, notice: Pick<SessionNotice, "message" | "extensionPath" | "extensionName">): void {
    void this.deps.store.find(sessionId).then((record) => {
      if (record) this.board.notify(sessionId, record.projectPath, {level: "warning", ...notice});
    });
  }

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

  public async dispose(): Promise<void> {
    const workers = await Promise.all([...this.workers.values()].map((pending) => pending.catch(() => undefined)));
    this.workers.clear();
    await Promise.all(workers.map((worker) => worker?.dispose()));
    await this.deps.store.dispose();
  }

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
