import type {
  ArchiveSessionPayload,
  ArchiveSessionResult,
  SessionIdPayload,
  ListComposerSuggestionsPayload,
  ListComposerSuggestionsResult,
  ListModelsPayload,
  ListModelsResult,
  PinSessionPayload,
  RenameSessionPayload,
  SearchSessionsPayload,
  SearchSessionsResult,
} from "@supernova/contracts/services/sessions/procedures";
import {ArchiveSessionError, CreateSessionError, RenameSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import type {ListedSession, SessionsView} from "@supernova/contracts/services/sessions/services";
import {toComposerSuggestions} from "@supernova/agent-runtime/features/sessions/lib/composer-suggestions";
import {toListedSession} from "@supernova/agent-runtime/features/sessions/lib/listed-session";
import {toAgentModelDetails} from "@supernova/agent-runtime/pi/lib/models/map-model";
import {refreshAuthAndModels} from "@supernova/agent-runtime/pi/lib/models/refresh-models";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface SessionsDeps {
  readonly store: Pick<SessionStore, "create" | "delete" | "find" | "list" | "search" | "update">;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
}

export class Sessions {
  private readonly deps: SessionsDeps;

  public constructor(deps: SessionsDeps) {
    this.deps = deps;
  }

  public async create(input: {readonly id: string; readonly projectPath: string; readonly worktree?: SessionWorktree}): Promise<void> {
    const {id, projectPath, worktree} = input;
    if (this.deps.store.find(id)) throw new CreateSessionError({message: "A session with this id already exists."});

    this.deps.store.create({id, projectPath, ...(worktree ? {worktree} : {})});
  }

  public async exists(input: SessionIdPayload): Promise<boolean> {
    return this.deps.store.find(input.sessionId) !== undefined;
  }

  public async record(input: SessionIdPayload): Promise<ListedSession | null> {
    return listedUnlessArchived(this.deps.store.find(input.sessionId));
  }

  public async getWorktree(input: SessionIdPayload): Promise<SessionWorktree | undefined> {
    return this.deps.store.find(input.sessionId)?.worktree;
  }

  public async delete(input: SessionIdPayload): Promise<void> {
    await this.deps.store.delete(input.sessionId);
  }

  public async rename(input: RenameSessionPayload): Promise<void> {
    const title = input.title.trim();
    if (title.length === 0) throw new RenameSessionError({message: "Session title cannot be empty."});
    if (!this.deps.store.find(input.sessionId)) throw new RenameSessionError({message: "Session not found."});

    this.deps.store.update(input.sessionId, (record) => ({...record, title}));
  }

  public async proposeTitle(input: {readonly sessionId: string; readonly title: string}): Promise<void> {
    const title = input.title.trim();
    if (!title || this.deps.store.find(input.sessionId)?.title !== undefined) return;

    this.deps.store.update(input.sessionId, (record) => (record.title === undefined ? {...record, title} : record));
  }

  public async touch(input: {readonly sessionId: string; readonly at: string}): Promise<void> {
    this.deps.store.update(input.sessionId, (record) => (input.at > record.updatedAt ? {...record, updatedAt: input.at} : record));
  }

  public async pin(input: PinSessionPayload): Promise<void> {
    if (!this.deps.store.find(input.sessionId)) throw new Error("Session not found.");

    this.deps.store.update(input.sessionId, (record) => ({...record, pinned: input.pinned}));
  }

  public async archive(input: ArchiveSessionPayload): Promise<ArchiveSessionResult> {
    const {projectPath, sessionId} = input;
    if (!this.deps.store.find(sessionId)) throw new ArchiveSessionError({message: "Session not found."});

    this.deps.store.update(sessionId, (current) => {
      if (current.archivedAt !== undefined) throw new ArchiveSessionError({message: "Session is already archived."});
      return {...current, archivedAt: new Date().toISOString()};
    });

    return {projectPath, sessionId};
  }

  public view({openId, projects}: {readonly projects: Readonly<Record<string, number>>; readonly openId: string | null}): SessionsView {
    return {
      projects: Object.fromEntries(
        Object.entries(projects).map(([projectPath, depth]) => {
          const records = this.deps.store.list({projectPath, limit: depth + 1});
          return [projectPath, {depth, loading: false, items: records.slice(0, depth).map(toListedSession), hasMore: records.length > depth}];
        })
      ),
      open: openId === null ? null : listedUnlessArchived(this.deps.store.find(openId)),
    };
  }

  public async search(input: SearchSessionsPayload): Promise<SearchSessionsResult> {
    if (input.projectPaths.length === 0) return {sessions: [], nextCursor: null};

    const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const records = this.deps.store.search({query: input.text.trim(), projectPaths: input.projectPaths, limit: input.limit + 1, ...(after ? {after} : {})});

    const page = records.slice(0, input.limit);
    const last = page.at(-1);
    return {sessions: page.map(toListedSession), nextCursor: records.length > input.limit && last ? encodeCursor(last) : null};
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

function listedUnlessArchived(record: SessionRecord | undefined): ListedSession | null {
  return record && record.archivedAt === undefined ? toListedSession(record) : null;
}

type SearchPosition = {readonly id: string; readonly pinned: boolean; readonly updatedAt: string};

function encodeCursor(record: SearchPosition): string {
  return Buffer.from(JSON.stringify({id: record.id, updatedAt: record.updatedAt})).toString("base64url");
}

function decodeCursor(cursor: string): SearchPosition {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {id?: unknown; updatedAt?: unknown};
    if (typeof value.id === "string" && typeof value.updatedAt === "string") return {id: value.id, updatedAt: value.updatedAt, pinned: false};
  } catch {}
  throw new Error("The search cursor is invalid.");
}
