import {randomUUID} from "node:crypto";
import {join} from "node:path";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import type {
  CompactSessionPayload,
  ForkSeed,
  LoadHistoryPayload,
  LoadHistoryResult,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import {CheckpointConflictError, CheckpointInheritedError, CheckpointUncapturedError} from "@supernova/contracts/services/session-runtime/procedures";
import type {SessionActivity, SessionReport} from "@supernova/contracts/services/sessions/procedures";
import {sessionActivityOf} from "@supernova/contracts/services/sessions/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {LoadedExtensions} from "@supernova/agent-runtime/pi/extensions/extensions";
import {loadExtensions} from "@supernova/agent-runtime/pi/extensions/extensions";
import {findSelectedModel} from "@supernova/agent-runtime/pi/lib/models/selected-model";
import {toPiThinkingLevel} from "@supernova/agent-runtime/pi/lib/models/thinking-levels";
import type {CheckpointRef, CheckpointStatus, SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {SessionExtension} from "@supernova/agent-runtime/pi/lib/tools/coding-tools";
import {preparePromptImages} from "@supernova/agent-runtime/pi/lib/user-message/prompt-images";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {NavigationState, SessionFileSetup, SessionModel} from "@supernova/agent-runtime/pi/session-file";
import {SessionFile} from "@supernova/agent-runtime/pi/session-file";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {prepareSendMessageContext} from "@supernova/agent-runtime/features/session-runtime/lib/send-message-context";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/title-generator";

export interface ChatDeps {
  readonly record: SessionRecord;
  readonly sessionsRoot: string;
  readonly checkpointStore: CheckpointStore;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
  readonly titleGenerator: TitleGenerator;
  readonly extensions: readonly SessionExtension[];
  readonly settings: (cwd: string) => SettingsManager;
}

export interface ChatPorts {
  readonly publish: (session: Session) => void;
  readonly report: (report: SessionReport) => Promise<void>;
}

const BUSY = "Session already has active work.";

function cwdOf(record: SessionRecord): string {
  return record.worktree?.path ?? record.projectPath;
}

export class Chat {
  public readonly file: SessionFile;
  // `deps.record` is as the host started; title and pin change only in the catalog.
  private readonly deps: ChatDeps;
  private readonly ports: ChatPorts;
  private readonly cwd: string;

  private extensions: LoadedExtensions;
  private settings: SettingsManager;
  private titled: boolean;
  private activity: SessionActivity | undefined;

  // A busy flag. We cannot infer it yet only from durable because it has no knowledge of checkpoint navigation
  private commandRunning = false;
  private cancelled = false;

  private queue: Promise<unknown> = Promise.resolve();

  private constructor(input: {
    readonly deps: ChatDeps;
    readonly ports: ChatPorts;
    readonly file: SessionFile;
    readonly extensions: LoadedExtensions;
    readonly settings: SettingsManager;
  }) {
    this.deps = input.deps;
    this.ports = input.ports;
    this.file = input.file;
    this.extensions = input.extensions;
    this.settings = input.settings;
    this.cwd = cwdOf(input.deps.record);
    this.titled = input.deps.record.title !== undefined;
  }

  public static async open(deps: ChatDeps, ports: ChatPorts): Promise<Chat> {
    const {id} = deps.record;

    const settings = deps.settings(cwdOf(deps.record));
    const {extensions, setup} = await Chat.prepare(deps, ports, settings);

    let chat: Chat | undefined;
    const file = await SessionFile.open({
      ...setup,
      sessionId: id,
      path: join(deps.sessionsRoot, id, "session.sqlite"),
      onReport: (error) => void ports.report({kind: "notice", notice: {level: "warning", message: errorMessage(error, String(error))}}).catch(() => undefined),
      onChange: () => void chat?.publish().catch(() => undefined),
    });

    try {
      await extensions.start();
      chat = new Chat({deps, ports, file, extensions, settings});
      // Settles runs that finished while the host was down.
      await chat.publish();
      return chat;
    } catch (error) {
      await file.close();
      throw error;
    }
  }

  private static async prepare(deps: ChatDeps, ports: ChatPorts, settings: SettingsManager): Promise<{extensions: LoadedExtensions; setup: SessionFileSetup}> {
    const cwd = cwdOf(deps.record);
    const resources = await deps.resourceCache.load(cwd);
    const extensions = loadExtensions({
      cwd,
      resources,
      modelRuntime: deps.sdk.modelRuntime,
      report: (notice) => void ports.report({kind: "notice", notice: {level: "warning", ...notice}}).catch(() => undefined),
    });

    return {
      extensions,
      setup: {
        cwd,
        modelRuntime: deps.sdk.modelRuntime,
        settings: () => settings,
        resources: () => ({contextFiles: resources.contextFiles, skills: resources.skills}),
        extensions: () => [...deps.extensions, ...extensions.extensions],
      },
    };
  }

  public async reload(): Promise<void> {
    await this.extensions.stop("reload");
    this.settings = this.deps.settings(this.cwd);
    const {extensions, setup} = await Chat.prepare(this.deps, this.ports, this.settings);

    this.file.install(setup);
    this.extensions = extensions;
    await extensions.start();
  }

  public async close(): Promise<void> {
    await this.queue;
    await this.extensions.stop("quit");
    await this.file.close();
  }

  public async publish(): Promise<void> {
    return this.queued(() => this.publishNow()).catch((error: unknown) => this.reportError(errorMessage(error, "Failed to publish session state.")));
  }

  public loadHistory(input: LoadHistoryPayload): Promise<LoadHistoryResult> {
    return this.file.historyPage(input);
  }

  public async abort(): Promise<void> {
    this.cancelled = true;
    await this.file.abort();
  }

  public forkSeed(turnId: string): Promise<ForkSeed> {
    return this.file.forkSeed(turnId);
  }

  public async seed(seed: ForkSeed): Promise<void> {
    await this.file.seed(seed);
    await this.publish();
  }

  public async sendMessage(input: SendMessagePayload): Promise<void> {
    if (this.commandRunning) throw new Error(BUSY);
    this.cancelled = false;

    const model = findSelectedModel(this.deps.sdk, input.modelReference);
    if (!(await this.deps.sdk.modelRuntime.checkAuth(model.provider))) throw new Error(`No API key for ${model.provider}/${model.id}`);

    if (!this.titled) {
      this.titled = true;
      this.deps.titleGenerator
        .generateSessionTitle({contentParts: input.contentParts, model})
        .then((title) => this.ports.report({kind: "title", title}))
        .catch(() => undefined);
    }

    const message = await prepareSendMessageContext(input, {projectPath: this.cwd, resourceCache: this.deps.resourceCache});
    const {images, hints} = await preparePromptImages(message.images, {autoResize: this.settings.getImageAutoResize(), model: model as never});
    const text = hints.length > 0 ? `${message.prompt}\n\n${hints.join("\n")}` : message.prompt;

    if (this.cancelled) throw new Error("Session was cancelled.");

    const capture = input.captureCheckpoints ?? true;
    const before = await this.captureCheckpoint(capture);

    const submitted = await this.queued(async () => {
      try {
        return await this.file.send({
          content: images.length > 0 ? [{type: "text", text}, ...images] : text,
          record: {contentParts: [...message.contentParts], capture, before},
          model: {provider: model.provider, modelId: model.id, thinkingLevel: toPiThinkingLevel(input.modelReference.thinkingLevel)},
        });
      } finally {
        await this.publishNow();
      }
    });

    await this.ports.report({kind: "sent", at: submitted.at});

    void submitted.wait().then(
      (settled) => {
        // Aborts are the user's; model errors show in the turn.
        if (settled.status === "unanswered" && settled.reason !== "aborted" && settled.reason !== "model_error") {
          this.reportError(typeof settled.detail === "string" ? settled.detail : `The message was not answered (${settled.reason}).`);
        }
      },
      // Closing the session ends the wait, not the turn, which resumes when it opens again.
      () => undefined
    );
  }

  public compact(input: CompactSessionPayload): Promise<void> {
    return this.command(async () => {
      try {
        await this.file.compact(this.model(input.modelReference));
      } catch (cause) {
        this.reportError(errorMessage(cause, "Failed to compact session."));
      }
    });
  }

  public undoCheckpoint(input: UndoCheckpointPayload): Promise<void> {
    return this.navigate(input.force ?? false, ({visibleCount}) => {
      if (visibleCount === 0) throw new Error("No checkpoint is available to undo.");
      return visibleCount - 1;
    });
  }

  public redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    return this.navigate(input.force ?? false, ({turns, visibleCount}) => {
      if (visibleCount >= turns.length) throw new Error("No checkpoint is available to redo.");
      return visibleCount + 1;
    });
  }

  public revertToMessage(input: RevertToMessagePayload): Promise<void> {
    return this.navigate(input.force ?? false, ({turns, visibleCount}) => {
      const index = turns.findIndex((turn) => turn.turnId === input.turnId);
      if (index === -1) throw new Error("Checkpoint target was not found.");
      return index < visibleCount ? index : index + 1;
    });
  }

  private navigate(force: boolean, target: (navigation: NavigationState) => number): Promise<void> {
    return this.command(async () => {
      const navigation = await this.file.navigation();
      const count = target(navigation);
      const boundary = count < navigation.visibleCount ? navigation.turns[count]?.record.before : navigation.turns[count - 1]?.record.after;
      const {current} = navigation;
      const sessionId = this.deps.record.id;

      if (boundary?.status === "captured") {
        // A fork copies the history, not the workspace snapshots behind it.
        if (boundary.sessionId !== sessionId) throw new CheckpointInheritedError({message: "This message came from the session this one was forked from."});
        const currentCaptured = current?.status === "captured" && current.sessionId === sessionId;
        if (!currentCaptured && !force) {
          throw new CheckpointUncapturedError({message: "The current checkpoint has no workspace snapshot. Restoring may discard uncaptured changes."});
        }

        try {
          await this.deps.checkpointStore.restore({
            checkpointId: boundary.checkpointId,
            force,
            fromCheckpointId: currentCaptured ? current.checkpointId : undefined,
            projectRoot: this.cwd,
            sessionId,
          });
        } catch (cause) {
          if (cause instanceof CheckpointConflictError) throw cause;
          throw new Error("Failed to restore workspace checkpoint.");
        }
      }

      await this.file.show(navigation.turns, count, boundary);
      // No engine frame announces a moved leaf.
      await this.publish();
    });
  }

  // One publication at a time, so a late one never moves the document back.
  private queued<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async publishNow(): Promise<void> {
    const session = await this.file.snapshot(this.deps.record);
    this.ports.publish(session);

    const activity = sessionActivityOf(session.live);
    if (activity !== this.activity) {
      this.activity = activity;
      await this.ports.report({kind: "activity", activity}).catch(() => undefined);
    }

    if (session.live.run === undefined) await this.settleTurns();
  }

  private async command(run: () => Promise<void>): Promise<void> {
    // Durable cannot tell that a navigation is running.
    if (this.commandRunning) throw new Error(BUSY);
    this.commandRunning = true;
    this.cancelled = false;
    try {
      if (await this.file.isRunning()) throw new Error(BUSY);
      await run();
    } finally {
      this.commandRunning = false;
    }
  }

  private model(reference: CompactSessionPayload["modelReference"]): SessionModel {
    const model = findSelectedModel(this.deps.sdk, reference);
    return {provider: model.provider, modelId: model.id, thinkingLevel: toPiThinkingLevel(reference.thinkingLevel)};
  }

  private async captureCheckpoint(capture: boolean): Promise<CheckpointRef> {
    const checkpointId = randomUUID();
    const sessionId = this.deps.record.id;
    const status: CheckpointStatus = !capture
      ? "disabled"
      : await this.deps.checkpointStore
          .capture({checkpointId, projectRoot: this.cwd, sessionId})
          .then(() => "captured" as const)
          .catch(() => "failed" as const);
    return {checkpointId, sessionId, status};
  }

  private async settleTurns(): Promise<void> {
    const {turnIds, capture} = await this.file.unsettledTurns();
    if (turnIds.length === 0) return;
    await this.file.settleTurns(turnIds, await this.captureCheckpoint(capture));
  }

  private reportError(message: string): void {
    void this.ports.report({kind: "notice", notice: {level: "error", message}}).catch(() => undefined);
  }
}
