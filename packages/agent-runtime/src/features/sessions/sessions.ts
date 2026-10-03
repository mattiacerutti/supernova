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
import {LegacySessionError, isLegacySession, loadLegacySession} from "@supernova/agent-runtime/pi/lib/session/legacy-sessions";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface SessionsDeps {
  readonly store: Pick<SessionStore, "create" | "delete" | "find" | "fork" | "update">;
  /**
   * Each durable session's document, owned by the session runtime; reads go through it so they match its
   * `session.state` deltas. `refresh` rebuilds and publishes it after a change outside the engine.
   */
  readonly documents: {readonly current: (sessionId: string) => Promise<Session>; readonly refresh: (sessionId: string) => Promise<Session>};
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
}

/** The durable session record: create, load, rename, and what a composer can reference. */
export class Sessions {
  public constructor(private readonly deps: SessionsDeps) {}

  /** Creates a new empty session for a project under the client's id. With a worktree the agent runs there. */
  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree}): Promise<Session> {
    const {id, projectPath, worktree} = input;
    if ((await this.deps.store.find(id)) || (await isLegacySession(id))) throw new CreateSessionError({message: "A session with this id already exists."});
    await this.deps.store.create({id, projectPath, ...(worktree ? {worktree} : {})});
    return this.deps.documents.current(id);
  }

  /** Whether a session is a durable one, which runs; a legacy session is only read. */
  public async isDurable(input: GetSessionPayload): Promise<boolean> {
    return (await this.deps.store.find(input.sessionId)) !== undefined;
  }

  /** The worktree a session runs in, if any. */
  public async getWorktree(input: GetSessionPayload): Promise<SessionWorktree | undefined> {
    const record = await this.deps.store.find(input.sessionId);
    return record ? record.worktree : (await loadLegacySession(input.sessionId))?.worktree;
  }

  /** Removes a session's file and record. For undoing a `create` whose setup failed; archiving keeps the file. */
  public async delete(input: GetSessionPayload): Promise<void> {
    await this.deps.store.delete(input.sessionId);
  }

  /**
   * Copies the conversation up to and including a visible turn into a new session. The source is untouched and
   * workspace files are not changed. Checkpoints stay keyed by the source session, so the fork cannot undo
   * inherited turns; only turns made after the fork restore files.
   */
  public async fork(input: ForkSessionPayload): Promise<Session> {
    if (!(await this.deps.store.find(input.sessionId))) {
      if (await isLegacySession(input.sessionId)) throw new ForkSessionError({message: new LegacySessionError().message});
      throw new ForkSessionError({message: "Session not found."});
    }
    const forked = await this.deps.store.fork({sessionId: input.sessionId, turnId: input.turnId}).catch((cause: unknown) => {
      throw new ForkSessionError({cause, message: cause instanceof Error ? cause.message : "Failed to fork session."});
    });
    return this.deps.documents.current(forked);
  }

  /** Loads one session: a durable one from its file, a legacy one read-only from its JSONL. */
  public async get(input: GetSessionPayload): Promise<Session> {
    if (await this.deps.store.find(input.sessionId)) return this.deps.documents.current(input.sessionId);
    const legacy = await loadLegacySession(input.sessionId);
    if (!legacy) throw new Error("Session not found.");
    return legacy;
  }

  /** Renames a session. */
  public async rename(input: RenameSessionPayload): Promise<Session> {
    const title = input.title.trim();
    if (title.length === 0) throw new RenameSessionError({message: "Session title cannot be empty."});
    if (!(await this.deps.store.find(input.sessionId))) {
      throw new RenameSessionError({message: (await isLegacySession(input.sessionId)) ? new LegacySessionError().message : "Session not found."});
    }
    await this.deps.store.update(input.sessionId, (record) => ({...record, title}));
    return this.deps.documents.refresh(input.sessionId);
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
