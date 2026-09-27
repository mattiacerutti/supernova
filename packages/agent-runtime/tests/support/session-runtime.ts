import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {AgentSession, PromptTemplate, SessionEntry, Skill} from "@earendil-works/pi-coding-agent";
import {createAgentSession, ModelRuntime, SessionManager, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api, FauxProviderRegistration} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxText, fauxThinking, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk, PiSessionManager} from "@supernova/agent-runtime/pi/sdk";
import type {AgentSessionFactory} from "@supernova/agent-runtime/features/session-runtime/worker/agent-session-factory";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionPool} from "@supernova/agent-runtime/features/session-runtime/worker/session-pool";
import {SessionRuntime} from "@supernova/agent-runtime/features/session-runtime/session-runtime";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import {EventBus} from "@supernova/agent-runtime/lib/event-bus";
import type {SendMessagePayload, SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {waitUntil} from "@tests/support/async";

export {fauxAssistantMessage, fauxText, fauxThinking, waitUntil};
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

function appendConversation(manager: PiSessionManager, input?: {assistantText?: string; requestText?: string}): void {
  const requestText = input?.requestText ?? "Existing request";
  const assistantText = input?.assistantText ?? "Existing response";
  manager.appendCustomEntry("supernova.user-message-content-parts", {contentParts: [{text: requestText, type: "text"}]});
  manager.appendMessage({content: [{text: requestText, type: "text"}], role: "user", timestamp: 1});
  manager.appendMessage(fauxAssistantMessage(assistantText, {timestamp: 2}));
}

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
  readonly promptTemplates?: readonly PromptTemplate[];
  readonly reopenManagers?: boolean;
  readonly sessionDir?: string;
  readonly settings?: Parameters<typeof SettingsManager.inMemory>[0];
  readonly skillContentByPath?: Readonly<Record<string, string>>;
  readonly skills?: readonly Skill[];
}) {
  const checkpointStorageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
  const defaultProjectRoot = mkdtempSync(join(tmpdir(), "supernova-test-project-"));
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
  });
  const sessions = new Map<string, PiSessionManager>();
  let openCount = 0;
  let refreshCount = 0;

  await registerFauxModel({faux, modelRuntime});

  const rememberSession = (manager: PiSessionManager) => {
    sessions.set(manager.getSessionId(), manager);
    return manager;
  };
  const sessionRecord = (manager: PiSessionManager) => ({
    info: {cwd: manager.getCwd(), id: manager.getSessionId(), path: manager.getSessionFile() ?? `memory://${manager.getSessionId()}`},
    manager,
  });

  const agentSessionFactory: AgentSessionFactory = {
    createAgentSession: ({cwd, sessionManager}) =>
      createAgentSession({
        cwd,
        modelRuntime,
        noTools: "all",
        sessionManager,
        settingsManager: SettingsManager.inMemory(input?.settings),
      }),
  };
  /** A `SessionManager` that keeps every created manager in memory so ids resolve without a sessions folder. */
  const sessionManagers = {
    create: (projectPath: string, _sessionDir: string | undefined, options?: {id?: string}) =>
      rememberSession(input?.sessionDir ? SessionManager.create(projectPath, input.sessionDir, options) : SessionManager.inMemory(projectPath, options)),
    listAll: async () => [...sessions.values()].map((manager) => sessionRecord(manager).info),
    open: (path: string) => {
      openCount++;
      const sessionManager = [...sessions.values()].find((manager) => sessionRecord(manager).info.path === path);
      if (!sessionManager) throw new Error("Session not found.");
      const sessionFile = sessionManager.getSessionFile();
      if (input?.reopenManagers && input.sessionDir && sessionFile) return SessionManager.open(sessionFile, input.sessionDir);
      return sessionManager;
    },
  } as unknown as PiSdk["SessionManager"];
  const sdk: Pick<PiSdk, "modelRuntime" | "SessionManager"> = {
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
    SessionManager: sessionManagers,
  };
  const titleGenerator: TitleGenerator = {
    generateSessionTitle: async () => "Generated title",
  };
  const resourceCache: ResourceCache = {
    initialize: async () => undefined,
    listPromptTemplates: async () => input?.promptTemplates ?? [],
    listSkills: async () => input?.skills ?? [],
    readSkillContent: async (skill) => {
      const content = input?.skillContentByPath?.[skill.filePath];
      if (content === undefined) throw new Error(`Missing test skill content for ${skill.filePath}`);
      return content;
    },
  };

  const events = new EventBus<SessionStreamEvent>();
  const pool = new SessionPool(
    {
      agentSessionFactory,
      checkpointStore: input?.checkpointStore ?? new FileCheckpointStore(checkpointStorageRoot),
      eventBus: events,
      resourceCache,
      sdk,
    },
    titleGenerator
  );
  const runtime = new SessionRuntime({events, pool});
  const sessionsFeature = new Sessions({resourceCache, sdk});

  /** Subscribes to runtime events and resolves once the stream has connected. Call `stop()` when done. */
  const watchEvents = async (): Promise<{readonly events: SessionStreamEvent[]; readonly stop: () => Promise<void>}> => {
    const events: SessionStreamEvent[] = [];
    const watcher = runtime.watchEvents();
    const pump = (async () => {
      for await (const event of watcher) events.push(event);
    })();
    await waitUntil(() => {
      if (!events.some((event) => event.type === "connected")) throw new Error("Stream did not connect.");
    });
    return {
      events,
      stop: async () => {
        await watcher.return(undefined);
        await pump;
      },
    };
  };

  /** Records runtime events while `run` executes, then waits for `settled(events)` to stop throwing. */
  const collectEvents = async (run: () => Promise<unknown>, settled: (events: readonly SessionStreamEvent[]) => void): Promise<SessionStreamEvent[]> => {
    const {events, stop} = await watchEvents();
    try {
      await run();
      await waitUntil(() => settled(events));
      return events;
    } finally {
      await stop();
    }
  };

  const sendMessage = (messageInput: Omit<SendMessagePayload, "contentParts"> & {readonly contentParts?: SendMessagePayload["contentParts"]; readonly message?: string}) =>
    collectEvents(
      () => {
        const {message, ...payload} = messageInput;
        return runtime.sendMessage({contentParts: message ? [{text: message, type: "text"}] : [], ...payload});
      },
      (events) => {
        const endedRevision = events.find((event) => event.type === "session.agent.ended")?.revision;
        if (events.some((event) => event.type === "session.error")) return;
        if (endedRevision === undefined) throw new Error("Session agent did not end.");
        if (!events.some((event) => event.type === "session.snapshot" && event.revision > endedRevision)) throw new Error("Session did not publish a final snapshot.");
      }
    );

  return {
    appendConversation: (manager: PiSessionManager, options?: {assistantText?: string; requestText?: string}) => appendConversation(manager, options),
    createSession: (projectPath = defaultProjectRoot) => sessionRecord(rememberSession(SessionManager.inMemory(projectPath))),
    faux,
    getSession: (sessionId: string) => {
      const manager = sessions.get(sessionId);
      return manager ? sessionRecord(manager) : undefined;
    },
    get refreshCount() {
      return refreshCount;
    },
    modelRuntime,
    get openCount() {
      return openCount;
    },
    agentSessionFactory,
    collectEvents,
    resourceCache,
    sdk,
    sessionRuntime: runtime,
    sendMessage,
    sessions: sessionsFeature,
    titleGenerator,
    watchEvents,
    unregister: async () => {
      await pool.dispose();
      faux.unregister();
      rmSync(checkpointStorageRoot, {force: true, recursive: true});
      rmSync(defaultProjectRoot, {force: true, recursive: true});
    },
  };
}
