import type {Session} from "@supernova/contracts/sessions/schemas";
import type {
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
import {abortSession} from "@supernova/agent-runtime/layers/session-runtime/operations/abort-session";
import {redoCheckpoint} from "@supernova/agent-runtime/layers/session-runtime/operations/checkpoint/redo-checkpoint";
import {revertToMessage} from "@supernova/agent-runtime/layers/session-runtime/operations/checkpoint/revert-to-message";
import {undoCheckpoint} from "@supernova/agent-runtime/layers/session-runtime/operations/checkpoint/undo-checkpoint";
import {compactSession} from "@supernova/agent-runtime/layers/session-runtime/operations/compact-session";
import {sendMessage} from "@supernova/agent-runtime/layers/session-runtime/operations/send-message";
import {PiSessionRuntime} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";
import type {PiSessionRuntimeDependencies} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-runtime";
import type {PiSessionTitleGeneratorShape} from "@supernova/agent-runtime/layers/session-runtime/internal/pi-session-title-generator";

/** Keeps one long-lived command runtime per active session. */
export class SessionRuntimePool {
  private readonly dependencies: PiSessionRuntimeDependencies;
  private readonly runtimes = new Map<string, PiSessionRuntime>();
  private readonly titleGenerator: PiSessionTitleGeneratorShape;

  public constructor(dependencies: PiSessionRuntimeDependencies, titleGenerator: PiSessionTitleGeneratorShape) {
    this.dependencies = dependencies;
    this.titleGenerator = titleGenerator;
  }

  /** Starts accepted message work on the target session runtime. */
  public async sendMessage(input: SendMessagePayload): Promise<void> {
    await sendMessage(this.getOrCreateRuntime(input.sessionId), this.titleGenerator, input);
  }

  /** Starts manual compaction on the target session runtime. */
  public async compactSession(input: CompactSessionPayload): Promise<void> {
    await compactSession(this.getOrCreateRuntime(input.sessionId), input);
  }

  /** Moves the session back to a selected message checkpoint. */
  public async revertToMessage(input: RevertToMessagePayload): Promise<void> {
    await revertToMessage(this.getOrCreateRuntime(input.sessionId), input);
  }

  /** Moves the session back to the previous checkpoint. */
  public async undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    await undoCheckpoint(this.getOrCreateRuntime(input.sessionId), input);
  }

  /** Moves the session forward to the next checkpoint after an undo. */
  public async redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    await redoCheckpoint(this.getOrCreateRuntime(input.sessionId), input);
  }

  /** Aborts active work for one session while preserving the retained runtime. */
  public async abortSession(sessionId: string): Promise<void> {
    await abortSession(this.runtimes.get(sessionId));
  }

  /** Returns the frozen committed session while its Pi branch is actively mutating. */
  public getCommittedSession(sessionId: string): Session | undefined {
    return this.runtimes.get(sessionId)?.getCommittedSession();
  }

  /** Releases a retained runtime before its durable session is archived. */
  public async releaseSession(sessionId: string): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;
    this.runtimes.delete(sessionId);
    await runtime.dispose();
  }

  /** Removes manifests and refs owned by an archived session. */
  public async deleteSessionCheckpoints(projectRoot: string, sessionId: string): Promise<void> {
    await this.dependencies.checkpointStore.deleteSession({projectRoot, sessionId});
  }

  /** Aborts all retained runtimes during server/runtime shutdown. */
  public async dispose(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.dispose()));
  }

  private getOrCreateRuntime(sessionId: string): PiSessionRuntime {
    const runtime = this.runtimes.get(sessionId) ?? new PiSessionRuntime({...this.dependencies, sessionId});
    this.runtimes.set(sessionId, runtime);
    return runtime;
  }
}
