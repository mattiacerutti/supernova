import type {Session} from "@supernova/contracts/sessions/schemas";
import type {
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionSetupStep,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
import {abortSession} from "@supernova/agent-runtime/features/session-runtime/worker/commands/abort-session";
import {redoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/redo-checkpoint";
import {revertToMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/revert-to-message";
import {undoCheckpoint} from "@supernova/agent-runtime/features/session-runtime/worker/commands/undo-checkpoint";
import {compactSession} from "@supernova/agent-runtime/features/session-runtime/worker/commands/compact-session";
import {sendMessage} from "@supernova/agent-runtime/features/session-runtime/worker/commands/send-message";
import {SessionWorker} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {SessionWorkerDependencies} from "@supernova/agent-runtime/features/session-runtime/worker/session-worker";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";

/** Keeps one long-lived command runtime per active session. */
export class SessionPool {
  private readonly dependencies: SessionWorkerDependencies;
  private readonly runtimes = new Map<string, SessionWorker>();
  private readonly titleGenerator: TitleGenerator;

  public constructor(dependencies: SessionWorkerDependencies, titleGenerator: TitleGenerator) {
    this.dependencies = dependencies;
    this.titleGenerator = titleGenerator;
  }

  /** Starts accepted message work on the target session runtime. */
  public async sendMessage(input: SendMessagePayload): Promise<void> {
    await sendMessage(await this.prepareRuntime(input.sessionId), this.titleGenerator, input);
  }

  /** Starts manual compaction on the target session runtime. */
  public async compactSession(input: CompactSessionPayload): Promise<void> {
    await compactSession(await this.prepareRuntime(input.sessionId), input);
  }

  /** Moves the session back to a selected message checkpoint. */
  public async revertToMessage(input: RevertToMessagePayload): Promise<void> {
    await revertToMessage(await this.prepareRuntime(input.sessionId), input);
  }

  /** Moves the session back to the previous checkpoint. */
  public async undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    await undoCheckpoint(await this.prepareRuntime(input.sessionId), input);
  }

  /** Moves the session forward to the next checkpoint after an undo. */
  public async redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    await redoCheckpoint(await this.prepareRuntime(input.sessionId), input);
  }

  /** Marks a setup step of a session being created, so clients can show progress before its first turn. */
  public publishSetup(sessionId: string, phase: "started" | "ended", step: SessionSetupStep): void {
    this.getOrCreateRuntime(sessionId).publishEvent({type: `session.setup.${phase}`, sessionId, step});
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

  /** Makes every retained session load the extensions on disk at its next command. */
  public reloadExtensions(): void {
    for (const runtime of this.runtimes.values()) runtime.markExtensionsStale();
  }

  /** Removes manifests and refs owned by an archived session. */
  public async deleteSessionCheckpoints(projectRoot: string, sessionId: string): Promise<void> {
    await this.dependencies.checkpointStore.deleteSession({projectRoot, sessionId});
  }

  /** Aborts all retained runtimes during server/runtime shutdown. */
  public async dispose(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.dispose()));
  }

  /** The session's runtime, with outdated extensions reloaded before a command starts on it. */
  private async prepareRuntime(sessionId: string): Promise<SessionWorker> {
    const runtime = this.getOrCreateRuntime(sessionId);
    await runtime.reloadStaleExtensions();
    return runtime;
  }

  private getOrCreateRuntime(sessionId: string): SessionWorker {
    const runtime = this.runtimes.get(sessionId) ?? new SessionWorker({...this.dependencies, sessionId});
    this.runtimes.set(sessionId, runtime);
    return runtime;
  }
}
