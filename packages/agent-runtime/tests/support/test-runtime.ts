import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, sep} from "node:path";
import {isDeepStrictEqual} from "node:util";
import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import {discoverAndLoadExtensions, ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api, FauxProviderRegistration} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";
import type {CheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {Watchable} from "@earendil-works/chord";
import {createModels} from "@earendil-works/pi-ai/models";
import {createRegistry, Harness} from "@earendil-works/pi-durable";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import type {SessionState, TurnRecord} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";
import {expectVariant} from "@supernova/agent-runtime/lib/chord/principals";
import {SessionHostsNative} from "@supernova/agent-runtime/core/contract";
import {SessionOperations, SessionsNative, SessionStatusNative, SessionStatusStore} from "@supernova/agent-runtime/features/sessions/contract";
import type {StatusChange} from "@supernova/agent-runtime/features/sessions/natives/session-status";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import type {
  CompactSessionPayload,
  LoadHistoryPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/chat/procedures";
import type {ChatOwner} from "@supernova/contracts/services/chat/services";
import type {ListedSession, SessionStatuses} from "@supernova/contracts/services/sessions/services";
import {ChatService} from "@supernova/contracts/services/chat/services";
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
import type {ModelReference} from "@supernova/contracts/services/sessions/schemas";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";
import type {AssistantMessage} from "@supernova/contracts/services/chat/schemas";
import {waitUntil} from "@tests/support/async";
import {startTestServerHost} from "@tests/support/server-host";

export {fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, waitUntil};

async function follow<T>(source: Watchable<T>, listener: (value: T) => void): Promise<() => void> {
  const watch = await source.watch(BACKGROUND_CONTEXT);
  listener(watch.value);
  watch.start(async (call) => {
    if (call.kind === "value") listener(call.value);
  });
  return () => void watch.stop();
}

export interface Observation {
  readonly versions: ChatDocument[];
  readonly board: SessionStatuses[];
  readonly stop: () => void;
}

export function turnContents(session: Pick<ChatDocument, "entries">) {
  return session.entries.items.flatMap((entry) => (entry.contentParts === undefined ? [] : [entry.contentParts]));
}

export function undoneContents(session: Pick<ChatDocument, "undone">) {
  return turnContents({entries: session.undone});
}

export function turnIds(session: Pick<ChatDocument, "entries">): string[] {
  return session.entries.items.flatMap((entry) => (entry.contentParts === undefined ? [] : [String(entry.id)]));
}

export function assistantTexts(session: Pick<ChatDocument, "entries">): string[] {
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

export async function createPiTestRuntime(input?: {
  readonly checkpointStore?: CheckpointStore;
  readonly tokensPerSecond?: number;
  readonly promptTemplates?: readonly PromptTemplate[];
  readonly settings?: Parameters<typeof SettingsManager.inMemory>[0];
  readonly skillContentByPath?: Readonly<Record<string, string>>;
  readonly skills?: readonly Skill[];
  readonly sessionStorageRoot?: string;
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

  // A test stubs `titles.next` to change the generated title or make it fail.
  const titles = {next: async (): Promise<string> => "Generated title"};
  const sdk = {
    modelRuntime: new Proxy(modelRuntime, {
      get(target, property, receiver) {
        // Tests never reach the network; the refresh that would is counted and downgraded.
        if (property === "refresh") {
          return async (options: Parameters<ModelRuntime["refresh"]>[0]) => {
            if (options?.allowNetwork) refreshCount++;
            return target.refresh({...options, allowNetwork: false});
          };
        }
        // The title request would take the faux response a test scripted for its first turn.
        if (property === "completeSimple") {
          return async (...args: Parameters<ModelRuntime["completeSimple"]>) =>
            args[1].systemPrompt?.startsWith("Generate a concise title") ? fauxAssistantMessage(await titles.next()) : target.completeSimple(...args);
        }
        return Reflect.get(target, property, receiver);
      },
    }),
  };
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
  // `settled` waits on running captures instead of reading the session file while git snapshots the project.
  const capturing = new Set<Promise<void>>();
  const countedStore: CheckpointStore = {
    capture: (capture) => {
      const running = checkpointStore.capture(capture);
      const tracked = running.finally(() => capturing.delete(tracked)).catch(() => undefined);
      capturing.add(tracked);
      return running;
    },
    deleteSession: (session) => checkpointStore.deleteSession(session),
    restore: (restore) => checkpointStore.restore(restore),
  };
  const server = await startTestServerHost({
    sdk: sdk as unknown as PiSdk,
    sessionStorageRoot,
    checkpointStore: countedStore,
    resourceCache,
    settings: () => settings,
    ...(input?.worktreeStorageRoot ? {worktreeStorageRoot: input.worktreeStorageRoot} : {}),
  });
  const ctx = BACKGROUND_CONTEXT;
  const owner = server.client;
  const host = server.serverHost.host;
  // The server's own natives, as its objects reach them.
  const catalog = (await host.registry(SessionsNative, ctx)).value!.value;
  const statusNative = (await host.registry(SessionStatusNative, ctx)).value!.value;
  const sessionHosts = (await host.registry(SessionHostsNative, ctx)).value!.value;
  const status = await host.get(SessionStatusStore, {}, ctx);
  const sessionOperations = await host.get(SessionOperations, {}, ctx);

  // The operations as the server runs them, without a browser's call.
  const operations = {
    create: (payload: CreateSessionPayload) => sessionOperations.create(payload, ctx),
    archive: (payload: ArchiveSessionPayload) => sessionOperations.archive(payload, ctx),
  };

  // What the server's own objects read and do, for tests that check them beside the client's view.
  const store = {
    find: async (sessionId: string): Promise<SessionRecord | undefined> => catalog.find(sessionId),
    exists: async (sessionId: string): Promise<boolean> => catalog.find(sessionId) !== undefined,
    record: (sessionId: string) => catalog.record({sessionId}),
    delete: (sessionId: string) => catalog.delete({sessionId}),
    changeStatus: async (sessionId: string, change: StatusChange) => statusNative.change(sessionId, change),
  };

  const reports: string[] = [];
  const seen = new Set<string>();
  const stopReports = await follow(status.statuses, (statuses) => {
    for (const entry of Object.values(statuses.sessions)) {
      for (const notice of entry.notices) {
        if (seen.has(notice.id)) continue;
        seen.add(notice.id);
        reports.push(notice.extensionPath ? `Extension ${notice.extensionPath} ${notice.message}` : notice.message);
      }
    }
  });
  const sessionsOwner = expectVariant(await owner.get(SessionsService, {clientId: "tests"}, ctx), "owner");
  const statusOwner = expectVariant(await owner.get(SessionStatusService, {}, ctx), "owner");

  // An unknown session's route waits instead of failing, so this checks the catalog first.
  const withChat = async <T>(sessionId: string, call: (chat: ChatOwner) => Promise<T>): Promise<T> => {
    if (!(await store.exists(sessionId))) throw new Error("Session not found.");
    const chat = await owner.get(ChatService, {sessionId}, ctx);
    try {
      return await call(expectVariant(chat, "owner"));
    } finally {
      chat.release();
    }
  };
  const committed = async (sessionId: string): Promise<{readonly state: SessionState; readonly lastEntryId: number | undefined} | undefined> => {
    // Without a lock wait: SQLite's wait is synchronous and would hold the session's own commits on this thread.
    const storage = await openNodeSqliteStorage(join(sessionStorageRoot, sessionId, "session.sqlite"), {busyTimeoutMs: 0});
    const viewer = await Harness.open(storage, {models: createModels(), registry: createRegistry(), readOnly: true}, ctx);
    try {
      const state = (await viewer.snapshot(SessionStateDoc, ctx)) as SessionState | undefined;
      if (!state) return undefined;
      const conversation = await viewer.conversation(state.conversation, ctx);
      const [last] = (await conversation?.entries({}, 8, undefined, ctx))?.items.filter((entry) => entry.kind !== "pi.system") ?? [];
      return {state, lastEntryId: last?.id};
    } finally {
      await viewer.close(ctx);
    }
  };
  // A read that meets the session's write lock fails at once; the next one runs after the commit.
  const readCommitted = async (sessionId: string) => {
    let read: Awaited<ReturnType<typeof committed>>;
    await waitUntil(async () => {
      read = await committed(sessionId);
    });
    return read;
  };
  const committedTurns = async (sessionId: string): Promise<Readonly<Record<string, TurnRecord>>> => (await readCommitted(sessionId))?.state.turns ?? {};

  const chat = {
    sendMessage: ({sessionId, ...input}: SendMessagePayload & {readonly sessionId: string}) => withChat(sessionId, (chat) => chat.sendMessage(input, ctx)),
    compact: ({sessionId, ...input}: CompactSessionPayload & {readonly sessionId: string}) => withChat(sessionId, (chat) => chat.compact(input, ctx)),
    abort: ({sessionId}: {readonly sessionId: string}) => withChat(sessionId, (chat) => chat.abort(ctx)),
    // A navigation's document follows its reply, once the conversation it moved to is attached.
    undoCheckpoint: ({sessionId, ...input}: UndoCheckpointPayload & {readonly sessionId: string}) =>
      navigated(
        sessionId,
        withChat(sessionId, (chat) => chat.undoCheckpoint(input, ctx))
      ),
    redoCheckpoint: ({sessionId, ...input}: RedoCheckpointPayload & {readonly sessionId: string}) =>
      navigated(
        sessionId,
        withChat(sessionId, (chat) => chat.redoCheckpoint(input, ctx))
      ),
    revertToMessage: ({sessionId, ...input}: RevertToMessagePayload & {readonly sessionId: string}) =>
      navigated(
        sessionId,
        withChat(sessionId, (chat) => chat.revertToMessage(input, ctx))
      ),
    loadHistory: ({sessionId, ...input}: LoadHistoryPayload & {readonly sessionId: string}) => withChat(sessionId, (chat) => chat.loadHistory(input, ctx)),
    current: (sessionId: string): Promise<ChatDocument> => withChat(sessionId, async (chat) => chat.document.value),
    reloadExtensions: async () => {
      await sessionHosts.reload();
    },
    stop: async (sessionId: string) => {
      await sessionHosts.release(sessionId, {abort: false});
    },
    release: async (input: {readonly sessionId: string; readonly workspacePath: string}) => {
      await sessionHosts.release(input.sessionId, {abort: false});
      await checkpointStore.deleteSession({projectRoot: input.workspacePath, sessionId: input.sessionId});
    },
    dispose: () => server.close(),
  };

  const sessionsFeature = {
    create: async (payload: CreateSessionPayload) => {
      await sessionsOwner.create(payload, ctx);
      return chat.current(payload.id);
    },
    fork: (payload: ForkSessionPayload) => sessionsOwner.fork(payload, ctx),
    rename: (payload: RenameSessionPayload) => sessionsOwner.rename(payload, ctx),
    get: ({sessionId}: SessionIdPayload) => chat.current(sessionId),
    record: ({sessionId}: SessionIdPayload) => store.record(sessionId),
    pin: (payload: PinSessionPayload) => sessionsOwner.pin(payload, ctx),
    archive: (payload: ArchiveSessionPayload) => sessionsOwner.archive(payload, ctx),
    listModels: (payload: ListModelsPayload) => sessionsOwner.listModels(payload, ctx),
    listComposerSuggestions: (payload: ListComposerSuggestionsPayload) => sessionsOwner.listComposerSuggestions(payload, ctx),
    exists: ({sessionId}: SessionIdPayload) => store.exists(sessionId),
    // The open session file must close first: Windows refuses to delete it.
    delete: async ({sessionId}: SessionIdPayload) => {
      await sessionHosts.release(sessionId, {abort: false});
      await store.delete(sessionId);
    },
  };

  const list = async (projectPath: string, depth = 100): Promise<ListedSession[]> => {
    const view = expectVariant(await owner.get(SessionsService, {clientId: `list:${crypto.randomUUID()}`}, ctx), "owner");
    try {
      await view.showProject({projectPath, depth}, ctx);
      // The view's state reaches this client after the call's result.
      await waitUntil(() => {
        if (view.view.value.projects[projectPath]?.loading !== false) throw new Error("The window has not arrived yet.");
      });
      return [...view.view.value.projects[projectPath]!.items];
    } finally {
      view.release();
    }
  };

  const search = async (payload: SearchSessionsPayload) => (await sessionsOwner.search(payload, ctx)).sessions;

  const observe = async (sessionId: string): Promise<Observation> => {
    if (!(await store.exists(sessionId))) throw new Error("Session not found.");
    const versions: ChatDocument[] = [];
    const board: SessionStatuses[] = [];
    const chat = expectVariant(await owner.get(ChatService, {sessionId}, ctx), "owner");
    const stopTranscript = await follow(chat.document, (value) => void versions.push(value));
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

  const settled = async (sessionId: string, timeoutMs?: number): Promise<void> => {
    await waitUntil(
      async () => {
        if ((await chat.current(sessionId)).live.run !== undefined) throw new Error("Session is still running.");
      },
      {timeoutMs}
    );
    const recorded = async () => {
      const files = await committed(sessionId);
      if (Object.values(files?.state.turns ?? {}).some((record) => record.after === undefined)) throw new Error("A turn has no after-turn checkpoint yet.");
      await showsCurrentConversation(sessionId, files?.lastEntryId);
    };
    // A capture takes as long as git does on the machine: the wait for its record starts once it finished.
    let done = false;
    while (!done) {
      while (capturing.size > 0) await Promise.all(capturing);
      await waitUntil(
        async () => {
          // A capture that started meanwhile ends this wait; the next one starts after it.
          if (capturing.size === 0) await recorded();
          done = capturing.size === 0;
        },
        {timeoutMs, intervalMs: 25}
      );
    }
  };

  const showsCurrentConversation = async (sessionId: string, lastEntryId: number | undefined) => {
    if ((await chat.current(sessionId)).entries.items.at(-1)?.id !== lastEntryId) throw new Error("The document does not show the current conversation yet.");
  };

  const navigated = async <T>(sessionId: string, command: Promise<T>): Promise<T> => {
    const result = await command;
    const lastEntryId = (await readCommitted(sessionId))?.lastEntryId;
    await waitUntil(() => showsCurrentConversation(sessionId, lastEntryId));
    return result;
  };

  const lastError = (sessionId: string) => statusOwner.statuses.value.sessions[sessionId]?.notices.findLast((notice) => notice.level === "error")?.message ?? null;

  const sendMessage = async (
    messageInput: Omit<SendMessagePayload, "contentParts"> & {readonly sessionId: string; readonly contentParts?: SendMessagePayload["contentParts"]; readonly message?: string}
  ) => {
    const {message, ...payload} = messageInput;
    const observation = await observeWhile(
      payload.sessionId,
      async () => {
        await chat.sendMessage({contentParts: message ? [{text: message, type: "text"}] : [], ...payload});
        await settled(payload.sessionId);
      },
      async (seen) => {
        if (!isDeepStrictEqual(seen.versions.at(-1), await chat.current(payload.sessionId))) throw new Error("The final value was not delivered yet.");
      }
    );
    // A status entry leaves once idle with nothing to show; the last error is read once its notice landed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {versions: observation.versions, board: observation.board, session: observation.versions.at(-1)!, error: lastError(payload.sessionId)};
  };

  const createSession = async (projectPath = defaultProjectRoot) => {
    const session = await sessionsFeature.create({id: crypto.randomUUID(), projectPath});
    return {info: {id: session.id, cwd: projectPath}};
  };

  const appendConversation = async (sessionId: string, options?: {readonly assistantText?: string; readonly requestText?: string}) => {
    faux.setResponses([fauxAssistantMessage(options?.assistantText ?? "Existing response")]);
    await sendMessage({message: options?.requestText ?? "Existing request", modelReference: selectedModelReference, sessionId, captureCheckpoints: false});
  };

  const turnRecords = async (sessionId: string) => {
    return Object.entries(await committedTurns(sessionId))
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
    operations,
    checkpointStore,
    server,
    get refreshCount() {
      return refreshCount;
    },
    resourceCache,
    sdk,
    chat,
    sessionStorageRoot,
    sendMessage,
    settled,
    settings,
    sessions: sessionsFeature,
    titles,
    turnRecords,
    unregister: async () => {
      stopReports();
      sessionsOwner.release();
      statusOwner.release();
      status.release();
      sessionOperations.release();
      await server.close();
      faux.unregister();
      rmSync(checkpointStorageRoot, {force: true, recursive: true});
      if (!input?.sessionStorageRoot) rmSync(sessionStorageRoot, {force: true, recursive: true});
      rmSync(defaultProjectRoot, {force: true, recursive: true});
    },
  };
}
