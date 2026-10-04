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
import type {SendMessagePayload} from "@supernova/contracts/services/session-runtime/procedures";
import type {AgentState, AssistantMessage, ModelReference, Session} from "@supernova/contracts/services/sessions/schemas";
import type {SessionDirectoryState} from "@supernova/contracts/services/sessions/services";
import {waitUntil} from "@tests/support/async";

export {fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, waitUntil};

/** What one observer of a session saw: every transcript value delivered to it, and every directory value. */
export interface Observation {
  /** Transcript values in delivery order, starting with its value when observing began. */
  readonly versions: Session[];
  /** Directory values in delivery order, starting with its value when observing began. */
  readonly board: SessionDirectoryState[];
  readonly stop: () => void;
}

/** The authored content of each turn, in order. */
export function turnContents(session: Pick<Session, "entries">) {
  return session.entries.flatMap((entry) => (entry.contentParts === undefined ? [] : [entry.contentParts]));
}

/** The authored content of each undone turn, in order. */
export function undoneContents(session: Pick<Session, "undone">) {
  return turnContents({entries: session.undone});
}

/** The id of each visible turn: its user entry's id. */
export function turnIds(session: Pick<Session, "entries">): string[] {
  return session.entries.flatMap((entry) => (entry.contentParts === undefined ? [] : [String(entry.id)]));
}

/** The text of every assistant entry, in order. */
export function assistantTexts(session: Pick<Session, "entries">): string[] {
  return session.entries.flatMap((entry) => {
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
  const runtime: SessionRuntime = new SessionRuntime({checkpointStore, resourceCache, sdk, store, titleGenerator});
  const sessionsFeature = new Sessions({documents: runtime, resourceCache, sdk, store});
  const projects = new Projects({store});

  /**
   * Observes a session as an attached client does: its transcript's replicated state, whose subscribers receive each
   * Chord delta as a new value, and the session board.
   */
  const observe = async (sessionId: string): Promise<Observation> => {
    const versions: Session[] = [];
    const board: SessionDirectoryState[] = [];
    const transcript = await runtime.transcript(sessionId);
    const stopTranscript = transcript.state.subscribe((value) => void versions.push(value));
    const stopBoard = runtime.board.state.subscribe((value) => void board.push(value));
    return {
      versions,
      board,
      stop: () => {
        stopTranscript();
        stopBoard();
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
  const settled = async (sessionId: string): Promise<void> => {
    await waitUntil(async () => {
      if ((await runtime.current(sessionId)).live.run !== undefined) throw new Error("Session is still running.");
      const state = await (await store.file(sessionId)).state();
      if (Object.values(state.turns).some((record) => record.after === undefined)) throw new Error("A turn has no after-turn checkpoint yet.");
    });
  };

  /** The board's last problem for a session, or null. */
  const lastError = (sessionId: string) => runtime.board.state.value.sessions[sessionId]?.error?.message ?? null;

  /**
   * Sends a message and waits for its run to settle. Returns every transcript value an attached client received, and
   * the final document.
   */
  const sendMessage = async (messageInput: Omit<SendMessagePayload, "contentParts"> & {readonly contentParts?: SendMessagePayload["contentParts"]; readonly message?: string}) => {
    const {message, ...payload} = messageInput;
    const observation = await observeWhile(
      payload.sessionId,
      async () => {
        await runtime.sendMessage({contentParts: message ? [{text: message, type: "text"}] : [], ...payload});
        await settled(payload.sessionId);
      },
      async (seen) => {
        if (seen.versions.at(-1) !== (await runtime.current(payload.sessionId))) throw new Error("The final value was not delivered yet.");
      }
    );
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
    const state = await (await store.file(sessionId)).state();
    return Object.entries(state.turns)
      .toSorted(([left], [right]) => Number(left) - Number(right))
      .map(([, record]) => record);
  };

  /** The visible conversation's stored model and thinking level. */
  const agent = async (sessionId: string) => (await (await store.file(sessionId)).view()).docs["pi.agent"] as AgentState | undefined;

  return {
    agent,
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
    projects,
    get refreshCount() {
      return refreshCount;
    },
    resourceCache,
    sdk,
    sessionRuntime: runtime,
    sessionStorageRoot,
    sendMessage,
    settled,
    settings,
    sessions: sessionsFeature,
    titleGenerator,
    turnRecords,
    unregister: async () => {
      await runtime.dispose();
      faux.unregister();
      rmSync(checkpointStorageRoot, {force: true, recursive: true});
      if (!input?.sessionStorageRoot) rmSync(sessionStorageRoot, {force: true, recursive: true});
      rmSync(defaultProjectRoot, {force: true, recursive: true});
    },
  };
}
