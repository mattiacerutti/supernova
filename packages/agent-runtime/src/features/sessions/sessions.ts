import type {
  ForkSessionPayload,
  GetSessionPayload,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  ListModelsPayload,
  ListModelsResult,
  RenameSessionPayload,
} from "@supernova/contracts/services/sessions/procedures";
import {CreateSessionError, ForkSessionError, RenameSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {Session, SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {toComposerSuggestions} from "@supernova/agent-runtime/features/sessions/lib/composer-suggestions";
import {toAgentModelDetails} from "@supernova/agent-runtime/pi/lib/models/map-model";
import {refreshAuthAndModels} from "@supernova/agent-runtime/pi/lib/models/refresh-models";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface SessionsDeps {
  readonly store: Pick<SessionStore, "create" | "delete" | "find" | "fork" | "update">;
  readonly documents: {readonly current: (sessionId: string) => Promise<Session>; readonly refresh: (sessionId: string) => Promise<Session>};
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
}

export class Sessions {
  public constructor(private readonly deps: SessionsDeps) {}

  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree}): Promise<Session> {
    const {id, projectPath, worktree} = input;
    if (await this.deps.store.find(id)) throw new CreateSessionError({message: "A session with this id already exists."});
    await this.deps.store.create({id, projectPath, ...(worktree ? {worktree} : {})});
    return this.deps.documents.current(id);
  }

  public async exists(input: GetSessionPayload): Promise<boolean> {
    return (await this.deps.store.find(input.sessionId)) !== undefined;
  }

  public async getWorktree(input: GetSessionPayload): Promise<SessionWorktree | undefined> {
    return (await this.deps.store.find(input.sessionId))?.worktree;
  }

  public async delete(input: GetSessionPayload): Promise<void> {
    await this.deps.store.delete(input.sessionId);
  }

  /** Checkpoints stay keyed by the source, so the fork cannot restore files for inherited turns. */
  public async fork(input: ForkSessionPayload): Promise<Session> {
    if (!(await this.deps.store.find(input.sessionId))) throw new ForkSessionError({message: "Session not found."});
    const forked = await this.deps.store.fork({sessionId: input.sessionId, turnId: input.turnId}).catch((cause: unknown) => {
      throw new ForkSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to fork session."});
    });
    return this.deps.documents.current(forked);
  }

  public async get(input: GetSessionPayload): Promise<Session> {
    if (!(await this.deps.store.find(input.sessionId))) throw new Error("Session not found.");
    return this.deps.documents.current(input.sessionId);
  }

  public async rename(input: RenameSessionPayload): Promise<Session> {
    const title = input.title.trim();
    if (title.length === 0) throw new RenameSessionError({message: "Session title cannot be empty."});
    if (!(await this.deps.store.find(input.sessionId))) throw new RenameSessionError({message: "Session not found."});
    await this.deps.store.update(input.sessionId, (record) => ({...record, title}));
    return this.deps.documents.refresh(input.sessionId);
  }

  public async listModels(input: ListModelsPayload): Promise<ListModelsResult> {
    await this.deps.resourceCache.initialize(input.projectPath);
    await refreshAuthAndModels(this.deps.sdk);
    const {modelRuntime} = this.deps.sdk;
    return modelRuntime.getAvailableSnapshot().map((model) => toAgentModelDetails(model, modelRuntime.getProvider(model.provider)?.name ?? model.provider));
  }

  public async listComposerSuggestions(input: ListComposerSuggestionsPayload): Promise<ListComposerSuggestionsResult> {
    const [skills, templates] = await Promise.all([this.deps.resourceCache.listSkills(input.projectPath), this.deps.resourceCache.listPromptTemplates(input.projectPath)]);
    return {items: toComposerSuggestions(skills, templates)};
  }
}
