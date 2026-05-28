import type {AgentSession, PromptTemplate, SessionEntry, Skill} from "@earendil-works/pi-coding-agent";
import {AuthStorage, createAgentSession, ModelRegistry, SessionManager, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api, FauxProviderRegistration} from "@earendil-works/pi-ai";
import {fauxAssistantMessage, fauxText, fauxThinking, registerFauxProvider} from "@earendil-works/pi-ai";
import {Effect, Fiber, Layer, ManagedRuntime, Stream} from "effect";
import {PiModelCatalog} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-model-catalog";
import type {PiModelCatalogShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-model-catalog";
import {PiResourceCatalog} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-resource-catalog";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-resource-catalog";
import {PiSessionStore} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-session-store";
import type {PiSessionInfo, PiSessionManager, PiSessionStoreShape} from "@supernova/agent-runtime/implementations/pi/shared/internal/pi-session-store";
import {PiSessionRuntimeFromInternal} from "@supernova/agent-runtime/implementations/pi/session-runtime/pi-session-runtime-live";
import {PiAgentSessionFactory} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-agent-session-factory";
import type {PiAgentSessionFactoryShape} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-agent-session-factory";
import {PiSessionTitleGenerator} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-title-generator";
import type {PiSessionTitleGeneratorShape} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/pi-session-title-generator";
import {SessionCheckpointStoreLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-checkpoint-store";
import {SessionEventBusLive} from "@supernova/agent-runtime/implementations/pi/session-runtime/internal/session-event-bus";
import {PiSessionsFromInternal} from "@supernova/agent-runtime/implementations/pi/sessions/pi-sessions-live";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime/session-runtime-service";
import {SessionsService} from "@supernova/agent-runtime/services/sessions/sessions-service";
import type {SendMessagePayload, SessionStreamEvent} from "@supernova/contracts/sessions/procedures";
import type {ModelReference, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";

export {fauxAssistantMessage, fauxText, fauxThinking};

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
  contentBase64: "aW1hZ2UtYnl0ZXM=",
  id: "image-1",
  kind: "image" as const,
  mime: "image/png",
  name: "diagram.png",
  size: 12,
  type: "attachment" as const,
};

export const textAttachment = {
  contentBase64: "VGhpcyBpcyBhIHRleHQgZmlsZS4=",
  id: "text-1",
  kind: "text" as const,
  mime: "text/plain",
  name: "notes.txt",
  size: 20,
  type: "attachment" as const,
};

export function piAgentMessage(input: unknown): AgentSession["messages"][number] {
  return input as AgentSession["messages"][number];
}

export function userMessage(text: string, timestamp = 1): AgentSession["messages"][number] {
  return piAgentMessage({content: [{text, type: "text"}], id: `user-${timestamp}`, role: "user", timestamp});
}

export function assistantMessage(text: string, timestamp = 2): AgentSession["messages"][number] {
  return piAgentMessage({content: [{text, type: "text"}], id: `assistant-${timestamp}`, role: "assistant", timestamp});
}

export function contentPartsEntry(contentParts: readonly UserMessageContentPart[], input?: {id?: string; parentId?: string | null; timestamp?: string}): SessionEntry {
  return {
    customType: "supernova.user-message-content-parts",
    data: {contentParts},
    id: input?.id ?? "content-parts-1",
    parentId: input?.parentId ?? null,
    timestamp: input?.timestamp ?? "1970-01-01T00:00:00.001Z",
    type: "custom",
  };
}

export function messageEntry(message: AgentSession["messages"][number], input?: {id?: string; parentId?: string | null; timestamp?: string}): SessionEntry {
  return {
    id: input?.id ?? `${message.role}-entry`,
    message,
    parentId: input?.parentId ?? null,
    timestamp: input?.timestamp ?? new Date(message.timestamp).toISOString(),
    type: "message",
  };
}

export function piEntries(messages: readonly AgentSession["messages"][number][]): SessionEntry[] {
  let parentId: string | null = null;

  return messages.flatMap((message, index) => {
    const timestamp = new Date(message.timestamp).toISOString();
    const entries: SessionEntry[] = [];

    if (message.role === "user") {
      const contentParts = Array.isArray(message.content)
        ? message.content
            .filter((part): part is {readonly text: string; readonly type: "text"} => part.type === "text" && "text" in part && part.text.length > 0)
            .map((part) => ({text: part.text, type: "text" as const}))
        : [{text: message.content, type: "text" as const}];
      const metadataEntry = contentPartsEntry(contentParts, {id: `metadata-${index}`, parentId, timestamp});
      entries.push(metadataEntry);
      parentId = metadataEntry.id;
    }

    const entry = messageEntry(message, {id: `entry-${index}`, parentId, timestamp});
    entries.push(entry);
    parentId = entry.id;
    return entries;
  });
}

export function appendConversation(manager: PiSessionManager, input?: {assistantText?: string; requestText?: string}): void {
  const requestText = input?.requestText ?? "Existing request";
  const assistantText = input?.assistantText ?? "Existing response";
  manager.appendCustomEntry("supernova.user-message-content-parts", {contentParts: [{text: requestText, type: "text"}]});
  manager.appendMessage({content: [{text: requestText, type: "text"}], role: "user", timestamp: 1});
  manager.appendMessage(fauxAssistantMessage(assistantText, {timestamp: 2}));
}

export async function collectEvents(stream: Stream.Stream<SessionStreamEvent>): Promise<SessionStreamEvent[]> {
  const events: SessionStreamEvent[] = [];
  await Effect.runPromise(Stream.runForEach(stream, (event) => Effect.sync(() => events.push(event))));
  return events;
}

function sessionInfoFromManager(manager: PiSessionManager): PiSessionInfo {
  return {
    allMessagesText: "",
    created: new Date("2026-01-01T00:00:00.000Z"),
    cwd: manager.getCwd(),
    firstMessage: "",
    id: manager.getSessionId(),
    messageCount: manager.buildSessionContext().messages.length,
    modified: new Date("2026-01-01T00:00:00.000Z"),
    name: manager.getSessionName(),
    path: manager.getSessionFile() ?? `memory://${manager.getSessionId()}`,
  } satisfies PiSessionInfo;
}

function registerFauxModel(input: {authStorage: AuthStorage; faux: FauxProviderRegistration; modelRegistry: ModelRegistry}): void {
  const model = input.faux.getModel();
  input.authStorage.setRuntimeApiKey(model.provider, "faux-key");
  input.modelRegistry.registerProvider(model.provider, {
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
}

export function createPiTestRuntime(input?: {
  readonly promptTemplates?: readonly PromptTemplate[];
  readonly reopenManagers?: boolean;
  readonly sessionDir?: string;
  readonly settings?: Parameters<typeof SettingsManager.inMemory>[0];
  readonly skillContentByPath?: Readonly<Record<string, string>>;
  readonly skills?: readonly Skill[];
}) {
  const authStorage = AuthStorage.inMemory();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const faux = registerFauxProvider({
    api: selectedPiModel.api,
    models: [{id: selectedPiModel.id, input: [...selectedPiModel.input], name: selectedPiModel.name, reasoning: selectedPiModel.reasoning}],
    provider: selectedPiModel.provider,
  });
  const sessions = new Map<string, {info: PiSessionInfo; manager: PiSessionManager}>();
  let refreshCount = 0;

  registerFauxModel({authStorage, faux, modelRegistry});

  const rememberSession = (manager: PiSessionManager) => {
    const info = sessionInfoFromManager(manager);
    sessions.set(info.id, {info, manager});
    return {info, manager};
  };

  const agentSessionFactory: PiAgentSessionFactoryShape = {
    createAgentSession: ({cwd, sessionManager}) =>
      createAgentSession({
        authStorage,
        cwd,
        modelRegistry,
        noTools: "all",
        sessionManager,
        settingsManager: SettingsManager.inMemory(input?.settings),
      }),
  };
  const sessionStore: PiSessionStoreShape = {
    createSessionManager: (projectPath) => rememberSession(input?.sessionDir ? SessionManager.create(projectPath, input.sessionDir) : SessionManager.inMemory(projectPath)).manager,
    openSessionById: async (sessionId) => {
      const session = sessions.get(sessionId);
      if (!session) throw new Error("Session not found.");
      const sessionFile = session.manager.getSessionFile();
      if (input?.reopenManagers && input.sessionDir && sessionFile)
        return {info: {...session.info, path: sessionFile}, manager: SessionManager.open(sessionFile, input.sessionDir)};
      return session;
    },
  };
  const modelCatalog: PiModelCatalogShape = {
    getAvailableModels: () => modelRegistry.getAvailable(),
    getProviderDisplayName: (providerId) => modelRegistry.getProviderDisplayName(providerId),
    refreshAuthAndModels: () => {
      refreshCount++;
      authStorage.reload();
      modelRegistry.refresh();
    },
  };
  const titleGenerator: PiSessionTitleGeneratorShape = {
    generateSessionTitle: async () => "Generated title",
  };
  const resourceCatalog: PiResourceCatalogShape = {
    listPromptTemplates: async () => input?.promptTemplates ?? [],
    listSkills: async () => input?.skills ?? [],
    readSkillContent: async (skill) => {
      const content = input?.skillContentByPath?.[skill.filePath];
      if (content === undefined) throw new Error(`Missing test skill content for ${skill.filePath}`);
      return content;
    },
  };

  const internalLive = Layer.mergeAll(
    Layer.succeed(PiAgentSessionFactory, agentSessionFactory),
    Layer.succeed(PiModelCatalog, modelCatalog),
    Layer.succeed(PiResourceCatalog, resourceCatalog),
    Layer.succeed(PiSessionStore, sessionStore),
    Layer.succeed(PiSessionTitleGenerator, titleGenerator)
  );
  const runtimeLive = PiSessionRuntimeFromInternal.pipe(Layer.provide(Layer.mergeAll(internalLive, SessionCheckpointStoreLive, SessionEventBusLive)));
  const sessionsLive = PiSessionsFromInternal.pipe(Layer.provide(internalLive));
  const runtime = ManagedRuntime.make(Layer.mergeAll(sessionsLive, runtimeLive));
  const runWithSessions = <A, E>(effect: Effect.Effect<A, E, SessionsService>) => runtime.runPromise(effect);
  const runWithSessionRuntime = <A, E>(effect: Effect.Effect<A, E, SessionRuntimeService>) => runtime.runPromise(effect);
  const sendMessage = async (messageInput: Omit<SendMessagePayload, "contentParts"> & {readonly contentParts?: SendMessagePayload["contentParts"]; readonly message?: string}) => {
    const events: SessionStreamEvent[] = [];
    const watcher = runtime.runFork(
      Effect.gen(function* () {
        const sessionRuntime = yield* SessionRuntimeService;
        yield* Stream.runForEach(sessionRuntime.watchEvents(), (event) => Effect.sync(() => events.push(event)));
      })
    );
    await waitUntil(() => {
      if (!events.some((event) => event.type === "connected")) throw new Error("Stream did not connect.");
    });

    await runWithSessionRuntime(
      Effect.gen(function* () {
        const sessionRuntime = yield* SessionRuntimeService;
        const {message, ...payload} = messageInput;
        yield* sessionRuntime.sendMessage({contentParts: message ? [{text: message, type: "text"}] : [], ...payload});
      })
    );
    await waitUntil(() => {
      if (!events.some((event) => event.type === "session.snapshot" || event.type === "session.error")) throw new Error("Session did not settle.");
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await runtime.runPromise(Fiber.interrupt(watcher).pipe(Effect.ignore));
    return events;
  };

  return {
    appendConversation: (manager: PiSessionManager, options?: {assistantText?: string; requestText?: string}) => appendConversation(manager, options),
    createSession: (projectPath = "/workspace") => rememberSession(SessionManager.inMemory(projectPath)),
    faux,
    getSession: (sessionId: string) => sessions.get(sessionId),
    get refreshCount() {
      return refreshCount;
    },
    modelRegistry,
    runWithSessions,
    runWithSessionRuntime,
    agentSessionFactory,
    modelCatalog,
    resourceCatalog,
    runtime,
    sessionStore,
    sendMessage,
    sessionsLive,
    titleGenerator,
    unregister: () => {
      runtime.dispose();
      faux.unregister();
    },
  };
}

export async function waitUntil(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1_000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}
