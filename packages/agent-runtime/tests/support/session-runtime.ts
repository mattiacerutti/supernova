import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import {ModelRuntime, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {Api, FauxProviderRegistration} from "@earendil-works/pi-ai/compat";
import {fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, registerFauxProvider} from "@earendil-works/pi-ai/compat";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {TitleGenerator} from "@supernova/agent-runtime/features/session-runtime/worker/title-generator";
import {FileCheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import type {CheckpointStore} from "@supernova/agent-runtime/features/session-runtime/checkpoints/checkpoint-store";
import {SessionRuntime} from "@supernova/agent-runtime/features/session-runtime/session-runtime";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import {Projects} from "@supernova/agent-runtime/features/projects/projects";
import {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {createSupernovaTools} from "@supernova/agent-runtime/features/session-runtime/tools/tools";
import {EventBus} from "@supernova/agent-runtime/lib/event-bus";
import type {SendMessagePayload, SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import {waitUntil} from "@tests/support/async";

export {fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, waitUntil};
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

export const textAttachment = {
  contentBase64: "VGhpcyBpcyBhIHRleHQgZmlsZS4=",
  id: "text-1",
  kind: "text" as const,
  mime: "text/plain",
  name: "notes.txt",
  size: 20,
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
}) {
  const checkpointStorageRoot = mkdtempSync(join(tmpdir(), "supernova-checkpoint-storage-"));
  const sessionStorageRoot = input?.sessionStorageRoot ?? mkdtempSync(join(tmpdir(), "supernova-session-storage-"));
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
    load: async () => {
      loadCount++;
      return {contextFiles: [], extensions: {errors: [], extensions: [], runtime: {} as never}, promptTemplates: input?.promptTemplates ?? [], skills: input?.skills ?? []};
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
  const events = new EventBus<SessionStreamEvent>();
  const checkpointStore = input?.checkpointStore ?? new FileCheckpointStore(checkpointStorageRoot);
  const tools = createSupernovaTools(modelRuntime);
  const store = new SessionStore({
    sdk,
    resourceCache,
    tools: () => tools,
    root: sessionStorageRoot,
    settings: () => settings,
    onReport: (sessionId, message) => runtime.reportError(sessionId, message),
  });
  const runtime: SessionRuntime = new SessionRuntime({checkpointStore, events, resourceCache, sdk, store, titleGenerator});
  const sessionsFeature = new Sessions({resourceCache, sdk, store});
  const projects = new Projects({store});

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

  /** Sends a message and waits for its run to end and the final snapshot. */
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
    const state = await (await store.file(sessionId)).state();
    return Object.entries(state.turns)
      .toSorted(([left], [right]) => Number(left) - Number(right))
      .map(([, record]) => record);
  };

  /** The visible conversation's stored model and thinking level. */
  const agent = async (sessionId: string) => (await (await store.file(sessionId)).view()).agent;

  return {
    agent,
    appendConversation,
    createSession,
    collectEvents,
    defaultProjectRoot,
    store,
    faux,
    get loadCount() {
      return loadCount;
    },
    modelRuntime,
    projects,
    get refreshCount() {
      return refreshCount;
    },
    resourceCache,
    sdk,
    sessionRuntime: runtime,
    sessionStorageRoot,
    sendMessage,
    settings,
    sessions: sessionsFeature,
    titleGenerator,
    turnRecords,
    watchEvents,
    unregister: async () => {
      await runtime.dispose();
      faux.unregister();
      rmSync(checkpointStorageRoot, {force: true, recursive: true});
      if (!input?.sessionStorageRoot) rmSync(sessionStorageRoot, {force: true, recursive: true});
      rmSync(defaultProjectRoot, {force: true, recursive: true});
    },
  };
}
