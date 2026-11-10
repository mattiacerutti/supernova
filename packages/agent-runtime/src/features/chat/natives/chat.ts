import {join} from "node:path";
import type {LiveState} from "@earendil-works/pi-durable";
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
} from "@supernova/contracts/services/chat/procedures";
import type {SessionActivity, SessionReport} from "@supernova/contracts/services/sessions/procedures";
import {sessionActivityOf} from "@supernova/contracts/services/sessions/procedures";
import type {RuntimeNatives} from "@supernova/agent-runtime/core/contract";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";
import type {LoadedExtensions} from "@supernova/agent-runtime/features/chat/durable/extensions/extensions";
import {loadExtensions} from "@supernova/agent-runtime/features/chat/durable/extensions/extensions";
import {prepareSendMessageContext} from "@supernova/agent-runtime/features/chat/lib/send-message-context";
import {generateSessionTitle} from "@supernova/agent-runtime/features/chat/lib/session-title";
import {preparePromptImages} from "@supernova/agent-runtime/features/chat/lib/user-message/prompt-images";
import type {SessionFileSetup, SessionModel} from "@supernova/agent-runtime/features/chat/natives/session-file";
import {SessionFile} from "@supernova/agent-runtime/features/chat/natives/session-file";
import type {Transcript, TranscriptFrame} from "@supernova/agent-runtime/features/chat/natives/transcript";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {findSelectedModel} from "@supernova/agent-runtime/pi/lib/models/selected-model";
import {toPiThinkingLevel} from "@supernova/agent-runtime/pi/lib/models/thinking-levels";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface ChatDeps extends Pick<RuntimeNatives, "checkpointStore" | "resourceCache" | "extensions" | "settings"> {
  readonly record: SessionRecord;
  readonly sessionsRoot: string;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
}

export interface ChatPorts {
  readonly report: (report: SessionReport) => Promise<void>;
}

const BUSY = "Session already has active work.";

function cwdOf(record: SessionRecord): string {
  return record.worktree?.path ?? record.projectPath;
}

export class Chat {
  public readonly transcript: Transcript;
  // `deps.record` is as the host started; title and pin change only in the catalog.
  private readonly deps: ChatDeps;
  private readonly ports: ChatPorts;
  private readonly file: SessionFile;
  private readonly cwd: string;

  private extensions: LoadedExtensions;
  private settings: SettingsManager;
  private titled: boolean;
  private activity: SessionActivity | undefined;

  // A busy flag. We cannot infer it yet only from durable because it has no knowledge of checkpoint navigation
  private commandRunning = false;
  private cancelled = false;

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
    this.transcript = input.file.transcript;
    this.extensions = input.extensions;
    this.settings = input.settings;
    this.cwd = cwdOf(input.deps.record);
    this.titled = input.deps.record.title !== undefined;
  }

  public static async open(deps: ChatDeps, ports: ChatPorts): Promise<Chat> {
    const {id} = deps.record;

    const settings = deps.settings(cwdOf(deps.record));
    const {extensions, setup} = await Chat.prepare(deps, ports, settings);

    const file = await SessionFile.open({
      ...setup,
      sessionId: id,
      path: join(deps.sessionsRoot, id, "session.sqlite"),
      checkpoints: deps.checkpointStore,
      onReport: (error) => void ports.report({kind: "notice", notice: {level: "warning", message: errorMessage(error, String(error))}}).catch(() => undefined),
    });

    try {
      await extensions.start();
      return new Chat({deps, ports, file, extensions, settings});
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

    this.file.replaceSetup(setup);
    this.extensions = extensions;
    await extensions.start();
  }

  public async close(): Promise<void> {
    await this.extensions.stop("quit");
    await this.file.close();
  }

  public async updateActivity(frame: TranscriptFrame): Promise<void> {
    const activity = sessionActivityOf((frame.view.docs["pi.live"] ?? {}) as LiveState);
    if (activity !== this.activity) {
      this.activity = activity;
      await this.ports.report({kind: "activity", activity}).catch(() => undefined);
    }

    if (activity === "idle") await this.file.recordAfterTurnCheckpoints();
  }

  public loadHistory(input: LoadHistoryPayload): Promise<LoadHistoryResult> {
    return this.transcript.loadHistory(input);
  }

  public async abort(): Promise<void> {
    this.cancelled = true;
    await this.file.stop();
  }

  public forkSeed(turnId: string): Promise<ForkSeed> {
    return this.file.forkSeed(turnId);
  }

  public seed(seed: ForkSeed): Promise<void> {
    return this.file.seed(seed);
  }

  public async sendMessage(input: SendMessagePayload): Promise<void> {
    if (this.commandRunning) throw new Error(BUSY);
    this.cancelled = false;

    const model = findSelectedModel(this.deps.sdk, input.modelReference);
    if (!(await this.deps.sdk.modelRuntime.checkAuth(model.provider))) throw new Error(`No API key for ${model.provider}/${model.id}`);

    if (!this.titled) {
      this.titled = true;
      generateSessionTitle(this.deps.sdk.modelRuntime, {contentParts: input.contentParts, model})
        .then((title) => this.ports.report({kind: "title", title}))
        .catch(() => undefined);
    }

    const message = await prepareSendMessageContext(input, {projectPath: this.cwd, resourceCache: this.deps.resourceCache});
    const {images, hints} = await preparePromptImages(message.images, {autoResize: this.settings.getImageAutoResize(), model: model as never});
    const text = hints.length > 0 ? `${message.prompt}\n\n${hints.join("\n")}` : message.prompt;

    if (this.cancelled) throw new Error("Session was cancelled.");

    const sent = await this.file.send({
      content: images.length > 0 ? [{type: "text", text}, ...images] : text,
      contentParts: message.contentParts,
      captureCheckpoint: input.captureCheckpoints ?? true,
      model: {provider: model.provider, modelId: model.id, thinkingLevel: toPiThinkingLevel(input.modelReference.thinkingLevel)},
    });

    await this.ports.report({kind: "sent", at: sent.at});

    void sent.answered().then(
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
    return this.command(() =>
      this.file.moveLeaf(input.force ?? false, ({active}) => {
        if (active === 0) throw new Error("No checkpoint is available to undo.");
        return active - 1;
      })
    );
  }

  public redoCheckpoint(input: RedoCheckpointPayload): Promise<void> {
    return this.command(() =>
      this.file.moveLeaf(input.force ?? false, ({turns, active}) => {
        if (active >= turns.length) throw new Error("No checkpoint is available to redo.");
        return active + 1;
      })
    );
  }

  public revertToMessage(input: RevertToMessagePayload): Promise<void> {
    return this.command(() =>
      this.file.moveLeaf(input.force ?? false, ({turns, active}) => {
        const index = turns.findIndex((turn) => turn.turnId === input.turnId);
        if (index === -1) throw new Error("Checkpoint target was not found.");
        return index < active ? index : index + 1;
      })
    );
  }

  private async command(run: () => Promise<void>): Promise<void> {
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

  private reportError(message: string): void {
    void this.ports.report({kind: "notice", notice: {level: "error", message}}).catch(() => undefined);
  }
}
