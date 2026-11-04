import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, sep} from "node:path";
import {isDeepStrictEqual} from "node:util";
import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import {discoverAndLoadExtensions, ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api, FauxProviderRegistration} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {Watchable} from "@earendil-works/chord";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import {SessionRuntime} from "@supernova/agent-runtime/features/session-runtime/facet";
import {createAgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {
  CompactSessionPayload,
  LoadHistoryPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import type {ChatOwner} from "@supernova/contracts/services/session-runtime/services";
import type {ListedSession, SessionStatuses} from "@supernova/contracts/services/sessions/services";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {
  ArchiveSessionPayload,
  CreateSessionPayload,
  ForkSessionPayload,
  SessionIdPayload,
  ListComposerSuggestionsPayload,
  ListModelsPayload,
  PinSessionPayload,
  RenameSessionPayload,
  SearchSessionsPayload,
} from "@supernova/contracts/services/sessions/procedures";
import type {AssistantMessage, ModelReference, Session} from "@supernova/contracts/services/sessions/schemas";
import {waitUntil} from "@tests/support/async";
import {startTestServerHost} from "@tests/support/server-host";

export {fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, waitUntil};

/**
 * Follows a watchable as a client does: its value when the watch was acquired, then each delivered call. Resolves once
 * the watch is started, so no change made after it is missed.
 */
async function follow<T>(source: Watchable<T>, listener: (value: T) => void): Promise<() => void> {
  const watch = await source.watch(BACKGROUND_CONTEXT);
  listener(watch.value);
  watch.start(async (call) => {
    if (call.kind === "value") listener(call.value);
  });
  return () => void watch.stop();
}

/** What one observer of a session saw: every transcript value delivered to it, and every status value. */
export interface Observation {
  /** Transcript values in delivery order, starting with its value when observing began. */
  readonly versions: Session[];
  readonly board: SessionStatuses[];
  readonly stop: () => void;
}

/** The authored content of each turn, in order. */
export function turnContents(session: Pick<Session, "entries">) {
  return session.entries.items.flatMap((entry) => (entry.contentParts === undefined ? [] : [entry.contentParts]));
}

/** The authored content of each undone turn, in order. */
export function undoneContents(session: Pick<Session, "undone">) {
  return turnContents({entries: session.undone});
}

/** The id of each visible turn: its user entry's id. */
export function turnIds(session: Pick<Session, "entries">): string[] {
  return session.entries.items.flatMap((entry) => (entry.contentParts === undefined ? [] : [String(entry.id)]));
}

/** The text of every assistant entry, in order. */
export function assistantTexts(session: Pick<Session, "entries">): string[] {
  return session.entries.items.flatMap((entry) => {
    const message = entry.model?.[0];
    if (entry.kind !== "pi.assistant" || message?.role !== "assistant") return [];
    return [(message as AssistantMessage).content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")];
  });
}
export const selectedPiModel = {
  api: "faux:test" as Api,
  baseUrl: "https://faux.local",
  contextWindow: 200_000,
  cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0},
  id: "claude-sonnet",
  input: ["text", "image"] as const,
  maxTokens: 8192,
  name: "Claude Sonnet",
  provider: "anthropic",
  reasoning: true,
};
export const selectedModelReference: ModelReference = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

export const imageAttachment = {
  contentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  id: "image-1",
  kind: "image" as const,
  mime: "image/png",
  name: "diagram.png",
  size: 12,
  type: "attachment" as const,
};

async function registerFauxModel(input: {faux: FauxProviderRegistration; modelRuntime: ModelRuntime}): Promise<void> {
  const model = input.faux.getModel();
  input.modelRuntime.registerProvider(model.provider, {
    api: input.faux.api as Api,
    apiKey: "faux-key",
    baseUrl: model.baseUrl,
    models: input.faux.models.map((candidate) => ({
      api: candidate.api,
      baseUrl: candidate.baseUrl,
      contextWindow: candidate.contextWindow,
      cost: candidate.cost,
      id: candidate.id,
      input: candidate.input,
      maxTokens: candidate.maxTokens,
      name: candidate.name,
      reasoning: candidate.reasoning === true,
    })),
    name: "Anthropic",
  });
  await input.modelRuntime.refresh({allowNetwork: false});
}

/**
 * Builds the session runtime over a real engine: session files in a temp directory, Pi's `ModelRuntime` with a faux
 * provider, in-memory settings, and test resources. `createSession` makes an empty session under a project.
 */
export async function createPiTestRuntime(input?: {
  readonly checkpointStore?: CheckpointStore;
  /** Streams responses at this rate, as the e2e server does; responses are instant by default. */
  readonly tokensPerSecond?: number;
  readonly promptTemplates?: readonly PromptTemplate[];
  readonly settings?: Parameters<typeof SettingsManager.inMemory>[0];
  readonly skillContentByPath?: Readonly<Record<string, string>>;
  readonly skills?: readonly Skill[];
  readonly sessionStorageRoot?: string;
  /** Old-SDK extension files to load into every session through Pi's loader, as a user's `extensions` setting would. */
  readonly extensionPaths?: readonly string[];
  readonly worktreeStorageRoot?: string;
}) {
  const checkpointStorageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
  const sessionStorageRoot = input?.sessionStorageRoot ?? mkdtempSync(join(tmpdir(), "supernova-session-storage-"));
  const defaultProjectRoot = mkdtempSync(join(tmpdir(), "supernova-test-project-")).split(sep).join("/");
  const modelRuntime = await ModelRuntime.create({modelsPath: null});
  const faux = registerFauxProvider({
    api: selectedPiModel.api,
    models: [
      {
        contextWindow: selectedPiModel.contextWindow,
        cost: selectedPiModel.cost,
        id: selectedPiModel.id,
        input: [...selectedPiModel.input],
        maxTokens: selectedPiModel.maxTokens,
        name: selectedPiModel.name,
        reasoning: selectedPiModel.reasoning,
      },
    ],
    provider: selectedPiModel.provider,
    ...(input?.tokensPerSecond ? {tokenSize: {max: 8, min: 4}, tokensPerSecond: input.tokensPerSecond} : {}),
  });
  let refreshCount = 0;
  await registerFauxModel({faux, modelRuntime});

  const sdk = {
    // Tests never reach the network; the refresh that would is counted and downgraded.
    modelRuntime: new Proxy(modelRuntime, {
      get(target, property, receiver) {
        if (property !== "refresh") return Reflect.get(target, property, receiver);
        return async (options: Parameters<ModelRuntime["refresh"]>[0]) => {
          if (options?.allowNetwork) refreshCount++;
          return target.refresh({...options, allowNetwork: false});
        };
      },
    }),
  };
  const titleGenerator: TitleGenerator = {generateSessionTitle: async () => "Generated title"};
  let loadCount = 0;
  const resourceCache: ResourceCache = {
    initialize: async () => undefined,
    invalidate: () => undefined,
    load: async (cwd) => {
      loadCount++;
      // An agent dir with no extensions of its own, so only the configured paths load.
      const extensions = input?.extensionPaths?.length
        ? await discoverAndLoadExtensions([...input.extensionPaths], cwd, sessionStorageRoot)
        : {errors: [], extensions: [], runtime: {} as never};
      if (extensions.errors.length > 0) throw new Error(extensions.errors.map((error) => `${error.path}: ${error.error}`).join("\n"));
      return {contextFiles: [], extensions, promptTemplates: input?.promptTemplates ?? [], skills: input?.skills ?? []};
    },
    listPromptTemplates: async () => input?.promptTemplates ?? [],
    listSkills: async () => input?.skills ?? [],
    readSkillContent: async (skill) => {
      const content = input?.skillContentByPath?.[skill.filePath];
      if (content === undefined) throw new Error(`Missing test skill content for ${skill.filePath}`);
      return content;
    },
  };

  // One settings object for every session, so a test can change it between turns as a user edits settings.json.
  const settings = SettingsManager.inMemory(input?.settings);
  const checkpointStore = input?.checkpointStore ?? new FileCheckpointStore(checkpointStorageRoot);
  const runtime = await createAgentRuntime({
    sdk: sdk as unknown as PiSdk,
    sessionStorageRoot,
    checkpointStore,
    resourceCache,
    titleGenerator,
    settings: () => settings,
    ...(input?.worktreeStorageRoot ? {worktreeStorageRoot: input.worktreeStorageRoot} : {}),
  });
  const {store} = runtime;
  /** Every notice sessions got, in order: extension diagnostics, engine reports and run failures. */
  const reports: string[] = [];
  const seen = new Set<string>();
  runtime.status.onChange((_sessionId, entry) => {
    for (const notice of entry?.notices ?? []) {
      if (seen.has(notice.id)) continue;
      seen.add(notice.id);
      reports.push(notice.extensionPath ? `Extension ${notice.extensionPath} ${notice.message}` : notice.message);
    }
  });
  const server = await startTestServerHost(runtime);
  const ctx = BACKGROUND_CONTEXT;
  const owner = server.client;
  const sessionsOwner = await owner.get(SessionsService, {clientId: "tests"}, ctx);
  const statusOwner = await owner.get(SessionStatusService, {}, ctx);
  if (sessionsOwner.variant !== "owner" || statusOwner.variant !== "owner") throw new Error("The owner's variants did not bind.");

  /** A declared failure comes back as its tagged error, as the feature threw it. */
  const settle = async <T>(result: Promise<ServiceResult<T, {readonly _tag: string}>>): Promise<T> => {
    const outcome = await result;
    if (outcome.ok) return outcome.value;
    throw Object.assign(new Error(outcome.error.message), {_tag: outcome.error.code});
  };

  /** An unknown session's route waits instead of failing, so this checks the catalog first. */
  const withChat = async <T>(sessionId: string, call: (chat: ChatOwner) => Promise<T>): Promise<T> => {
    if (!(await runtime.sessions.exists({sessionId}))) throw new Error("Session not found.");
    const chat = await owner.get(ChatService, {sessionId}, ctx);
    try {
      if (chat.variant !== "owner") throw new Error("The owner's chat variant did not bind.");
      return await call(chat);
    } finally {
      chat.release();
    }
  };
  const runtimeOf = async (sessionId: string) => {
    // Holding its chat starts the session's host, as a page opening it does.
    await withChat(sessionId, async () => undefined);
    const host = await server.serverHost.hosts.startedHost(sessionId);
    if (!host) throw new Error(`Session ${sessionId} has no running host.`);
    return host.get(SessionRuntime, {}, ctx);
  };

  const sessionRuntime = {
    sendMessage: ({sessionId, ...input}: SendMessagePayload) => withChat(sessionId, (chat) => settle(chat.sendMessage(input, ctx))),
    compact: ({sessionId, ...input}: CompactSessionPayload) => withChat(sessionId, (chat) => settle(chat.compact(input, ctx))),
    abort: ({sessionId}: {readonly sessionId: string}) => withChat(sessionId, (chat) => settle(chat.abort(ctx))),
    undoCheckpoint: ({sessionId, ...input}: UndoCheckpointPayload) => withChat(sessionId, (chat) => settle(chat.undoCheckpoint(input, ctx))),
    redoCheckpoint: ({sessionId, ...input}: RedoCheckpointPayload) => withChat(sessionId, (chat) => settle(chat.redoCheckpoint(input, ctx))),
    revertToMessage: ({sessionId, ...input}: RevertToMessagePayload) => withChat(sessionId, (chat) => settle(chat.revertToMessage(input, ctx))),
    loadHistory: ({sessionId, ...input}: LoadHistoryPayload) => withChat(sessionId, (chat) => settle(chat.loadHistory(input, ctx))),
    current: async (sessionId: string): Promise<Session> => (await runtimeOf(sessionId)).current(ctx),
    /** Reloads every open session's extensions, as Settings → Extensions → Update does after installing. */
    reloadExtensions: () => store.reload(),
    release: async (input: {readonly sessionId: string; readonly workspacePath: string}) => {
      await server.serverHost.hosts.release(input.sessionId);
      await store.release(input.sessionId);
      await checkpointStore.deleteSession({projectRoot: input.workspacePath, sessionId: input.sessionId});
    },
    dispose: () => server.close(),
  };

  const sessionsFeature = {
    create: (payload: CreateSessionPayload) => settle(sessionsOwner.create(payload, ctx)),
    fork: (payload: ForkSessionPayload) => settle(sessionsOwner.fork(payload, ctx)),
    rename: (payload: RenameSessionPayload) => settle(sessionsOwner.rename(payload, ctx)),
    get: ({sessionId}: SessionIdPayload) => sessionRuntime.current(sessionId),
    record: ({sessionId}: SessionIdPayload) => runtime.sessions.record({sessionId}),
    pin: (payload: PinSessionPayload) => settle(sessionsOwner.pin(payload, ctx)),
    archive: (payload: ArchiveSessionPayload) => settle(sessionsOwner.archive(payload, ctx)),
    listModels: (payload: ListModelsPayload) => settle(sessionsOwner.listModels(payload, ctx)),
    listComposerSuggestions: (payload: ListComposerSuggestionsPayload) => settle(sessionsOwner.listComposerSuggestions(payload, ctx)),
    exists: (payload: SessionIdPayload) => runtime.sessions.exists(payload),
    delete: (payload: SessionIdPayload) => runtime.sessions.delete(payload),
  };

  const list = async (projectPath: string, depth = 100): Promise<ListedSession[]> => {
    const view = await owner.get(SessionsService, {clientId: `list:${crypto.randomUUID()}`}, ctx);
    try {
      if (view.variant !== "owner") throw new Error("The owner's sessions variant did not bind.");
      await settle(view.showProject({projectPath, depth}, ctx));
      // The view's state reaches this client after the call's result.
      await waitUntil(() => {
        if (view.view.value.projects[projectPath]?.loading !== false) throw new Error("The window has not arrived yet.");
      });
      return [...view.view.value.projects[projectPath]!.items];
    } finally {
      view.release();
    }
  };

  const search = async (payload: SearchSessionsPayload) => (await settle(sessionsOwner.search(payload, ctx))).sessions;

  /**
   * Observes a session as a client following it does: its published document as Chord delivers it, and the live
   * status of every session.
   */
  const observe = async (sessionId: string): Promise<Observation> => {
    if (!(await runtime.sessions.exists({sessionId}))) throw new Error("Session not found.");
    const versions: Session[] = [];
    const board: SessionStatuses[] = [];
    const chat = await owner.get(ChatService, {sessionId}, ctx);
    if (chat.variant !== "owner") throw new Error("The owner's chat variant did not bind.");
    const stopTranscript = await follow(chat.session, (value) => void versions.push(value));
    const stopBoard = await follow(statusOwner.statuses, (value) => void board.push(value));
    return {
      versions,
      board,
      stop: () => {
        stopTranscript();
        stopBoard();
        chat.release();
      },
    };
  };

  /** Runs `work` while observing a session, then waits for `settled` to stop throwing. */
  const observeWhile = async (sessionId: string, work: () => Promise<unknown>, settled: (observation: Observation) => void | Promise<void> = () => undefined) => {
    const observation = await observe(sessionId);
    try {
      await work();
      await waitUntil(() => settled(observation));
      return observation;
    } finally {
      observation.stop();
    }
  };

  /** Waits until the session's run ended and every turn has its after-turn checkpoint. */
  const settled = async (sessionId: string, timeoutMs?: number): Promise<void> => {
    await waitUntil(
      async () => {
        if ((await sessionRuntime.current(sessionId)).live.run !== undefined) throw new Error("Session is still running.");
        const turns = await (await store.file(sessionId)).turnRecords();
        if (Object.values(turns).some((record) => record.after === undefined)) throw new Error("A turn has no after-turn checkpoint yet.");
      },
      {timeoutMs}
    );
  };

  const lastError = (sessionId: string) => statusOwner.statuses.value.sessions[sessionId]?.notices.findLast((notice) => notice.level === "error")?.message ?? null;

  /**
   * Sends a message and waits for its run to settle. Returns every transcript value an attached client received, and
   * the final document.
   */
  const sendMessage = async (messageInput: Omit<SendMessagePayload, "contentParts"> & {readonly contentParts?: SendMessagePayload["contentParts"]; readonly message?: string}) => {
    const {message, ...payload} = messageInput;
    const observation = await observeWhile(
      payload.sessionId,
      async () => {
        await sessionRuntime.sendMessage({contentParts: message ? [{text: message, type: "text"}] : [], ...payload});
        await settled(payload.sessionId);
      },
      async (seen) => {
        if (!isDeepStrictEqual(seen.versions.at(-1), await sessionRuntime.current(payload.sessionId))) throw new Error("The final value was not delivered yet.");
      }
    );
    // A status entry leaves once idle with nothing to show; the last error is read once its notice landed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {versions: observation.versions, board: observation.board, session: observation.versions.at(-1)!, error: lastError(payload.sessionId)};
  };

  /** Creates an empty session under `projectPath`. */
  const createSession = async (projectPath = defaultProjectRoot) => {
    const session = await sessionsFeature.create({id: crypto.randomUUID(), projectPath});
    return {info: {id: session.id, cwd: projectPath}};
  };

  /** Appends one completed turn by running it against the faux model. Call before setting the test's responses. */
  const appendConversation = async (sessionId: string, options?: {readonly assistantText?: string; readonly requestText?: string}) => {
    faux.setResponses([fauxAssistantMessage(options?.assistantText ?? "Existing response")]);
    await sendMessage({message: options?.requestText ?? "Existing request", modelReference: selectedModelReference, sessionId, captureCheckpoints: false});
  };

  /** The session's turn records in turn order: authored content, checkpoints, and the model each was sent with. */
  const turnRecords = async (sessionId: string) => {
    return Object.entries(await (await store.file(sessionId)).turnRecords())
      .toSorted(([left], [right]) => Number(left) - Number(right))
      .map(([, record]) => record);
  };

  return {
    statuses: () => statusOwner.statuses.value,
    reports,
    appendConversation,
    createSession,
    lastError,
    observe,
    observeWhile,
    defaultProjectRoot,
    store,
    faux,
    get loadCount() {
      return loadCount;
    },
    modelRuntime,
    list,
    search,
    runtime,
    server,
    get refreshCount() {
      return refreshCount;
    },
    resourceCache,
    sdk,
    sessionRuntime,
    sessionStorageRoot,
    sendMessage,
    settled,
    settings,
    sessions: sessionsFeature,
    titleGenerator,
    turnRecords,
    unregister: async () => {
      sessionsOwner.release();
      statusOwner.release();
      await server.close();
      await runtime.dispose();
      faux.unregister();
      rmSync(checkpointStorageRoot, {force: true, recursive: true});
      if (!input?.sessionStorageRoot) rmSync(sessionStorageRoot, {force: true, recursive: true});
      rmSync(defaultProjectRoot, {force: true, recursive: true});
    },
  };
}
