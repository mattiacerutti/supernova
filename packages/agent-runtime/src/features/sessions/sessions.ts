import {writeFile} from "node:fs/promises";
import type {
  CreateSessionPayload,
  GetSessionPayload,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  ListModelsPayload,
  ListModelsResult,
  RenameSessionPayload,
} from "@supernova/contracts/sessions/procedures";
import {CreateSessionError, RenameSessionError} from "@supernova/contracts/sessions/procedures";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {toComposerSuggestions} from "@supernova/agent-runtime/features/sessions/lib/composer-suggestions";
import {resolveModelContextWindow} from "@supernova/agent-runtime/pi/lib/models/context-window";
import {toAgentModelDetails} from "@supernova/agent-runtime/pi/lib/models/map-model";
import {buildSessionSnapshot, sessionModelReference} from "@supernova/agent-runtime/pi/lib/session/build-session-snapshot";
import {refreshAuthAndModels} from "@supernova/agent-runtime/pi/lib/models/refresh-models";
import {openSessionById} from "@supernova/agent-runtime/pi/lib/session/open-session";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface SessionsDeps {
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime" | "SessionManager">;
}

/** The durable session record: create, load, rename, and what a composer can reference. */
export class Sessions {
  public constructor(private readonly deps: SessionsDeps) {}

  /** Creates a new empty Pi session for a project. */
  public async create(input: CreateSessionPayload): Promise<Session> {
    const sessionManager = this.deps.sdk.SessionManager.create(input.projectPath);
    const sessionFile = sessionManager.getSessionFile();
    const header = sessionManager.getHeader();
    if (!sessionFile || !header) throw new CreateSessionError({message: "Failed to create session."});

    await writeFile(sessionFile, `${JSON.stringify(header)}\n`, {flag: "wx"});
    return {
      id: sessionManager.getSessionId(),
      context: {usedTokens: 0, contextWindow: 0},
      projectPath: input.projectPath,
      title: "Untitled session",
      turns: [],
      undoneTurns: [],
      updatedAt: header.timestamp,
    };
  }

  /** Loads one Pi session and maps it into the shared session detail contract. */
  public async get(input: GetSessionPayload): Promise<Session> {
    const sessionManager = await openSessionById(this.deps.sdk, input.sessionId);
    const modelReference = sessionModelReference(sessionManager);
    return buildSessionSnapshot({contextWindow: resolveModelContextWindow(this.deps.sdk, modelReference), modelReference, sessionManager});
  }

  /** Renames a Pi session by appending a session metadata entry. */
  public async rename(input: RenameSessionPayload): Promise<Session> {
    const title = input.title.trim();
    if (title.length === 0) throw new RenameSessionError({message: "Session title cannot be empty."});

    const sessionManager = await openSessionById(this.deps.sdk, input.sessionId);
    sessionManager.appendSessionInfo(title);

    const modelReference = sessionModelReference(sessionManager);
    if (!modelReference) {
      return {
        id: sessionManager.getSessionId(),
        context: {usedTokens: 0, contextWindow: 0},
        projectPath: sessionManager.getCwd(),
        title,
        turns: [],
        undoneTurns: [],
        updatedAt: new Date().toISOString(),
      };
    }
    return buildSessionSnapshot({contextWindow: resolveModelContextWindow(this.deps.sdk, modelReference), modelReference, sessionManager});
  }

  /** Lists available Pi models mapped into shared model details. */
  public async listModels(input: ListModelsPayload): Promise<ListModelsResult> {
    await this.deps.resourceCache.initialize(input.projectPath);
    await refreshAuthAndModels(this.deps.sdk);
    const {modelRuntime} = this.deps.sdk;
    return modelRuntime.getAvailableSnapshot().map((model) => toAgentModelDetails(model, modelRuntime.getProvider(model.provider)?.name ?? model.provider));
  }

  /** Returns the complete project resource list for client-side composer filtering. */
  public async listComposerSuggestions(input: ListComposerSuggestionsPayload): Promise<ListComposerSuggestionsResult> {
    const [skills, templates] = await Promise.all([this.deps.resourceCache.listSkills(input.projectPath), this.deps.resourceCache.listPromptTemplates(input.projectPath)]);
    return {items: toComposerSuggestions(skills, templates)};
  }
}
