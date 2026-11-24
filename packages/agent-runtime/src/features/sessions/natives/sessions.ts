import {existsSync} from "node:fs";
import {rm} from "node:fs/promises";
import {join} from "node:path";
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
import type {Published} from "@supernova/agent-runtime/lib/chord/state";
import {resolveProjectPath} from "@supernova/agent-runtime/lib/project-path";
import {toComposerSuggestions} from "@supernova/agent-runtime/features/sessions/lib/composer-suggestions";
import {toListedSession} from "@supernova/agent-runtime/features/sessions/lib/listed-session";
import {importLegacySessions} from "@supernova/agent-runtime/features/sessions/lib/legacy/legacy-sessions";
import {toAgentModelDetails} from "@supernova/agent-runtime/pi/lib/models/map-model";
import {refreshAuthAndModels} from "@supernova/agent-runtime/pi/lib/models/refresh-models";
import {SessionCatalog} from "@supernova/agent-runtime/features/sessions/natives/session-catalog";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface SessionsDeps {
  readonly root: string;
  readonly revision: Published<number>;
  readonly resourceCache: ResourceCache;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
}

export class Sessions {
  public readonly root: string;
  private readonly deps: SessionsDeps;
  private readonly catalog: SessionCatalog;

  private constructor(deps: SessionsDeps, catalog: SessionCatalog) {
    this.deps = deps;
    this.root = deps.root;
    this.catalog = catalog;
  }

  public static async open(deps: SessionsDeps): Promise<Sessions> {
    const catalog = await SessionCatalog.open(join(deps.root, "catalog.sqlite"));

    try {
      await importLegacySessions({root: deps.root, catalog, report: (message) => console.warn(`[sessions] ${message}`)});
    } catch (error) {
      catalog.close();
      throw error;
    }

    return new Sessions(deps, catalog);
  }

  public find(sessionId: string): SessionRecord | undefined {
    return this.catalog.find(sessionId);
  }

  public async create(input: {
    readonly id: string;
    readonly projectPath: string;
    readonly worktree?: SessionWorktree;
    readonly forkedFrom?: string;
    readonly title?: string;
  }): Promise<SessionRecord> {
    if (this.catalog.find(input.id) || existsSync(join(this.root, input.id))) throw new CreateSessionError({message: "A session with this id already exists."});

    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      projectPath: resolveProjectPath(input.projectPath),
      ...(input.worktree ? {worktree: input.worktree} : {}),
      ...(input.title ? {title: input.title} : {}),
      ...(input.forkedFrom ? {forkedFrom: input.forkedFrom} : {}),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };

    this.catalog.insert(record);
    this.changed();
    return record;
  }

  public async record(input: SessionIdPayload): Promise<ListedSession | null> {
    return listedUnlessArchived(this.catalog.find(input.sessionId));
  }

  public async delete(input: SessionIdPayload): Promise<void> {
    await rm(join(this.root, input.sessionId), {force: true, recursive: true});
    if (this.catalog.delete(input.sessionId)) this.changed();
  }

  public async rename(input: RenameSessionPayload): Promise<void> {
    const title = input.title.trim();
    if (title.length === 0) throw new RenameSessionError({message: "Session title cannot be empty."});
    if (!this.catalog.find(input.sessionId)) throw new RenameSessionError({message: "Session not found."});

    this.update(input.sessionId, (record) => ({...record, title}));
  }

  public async proposeTitle(input: {readonly sessionId: string; readonly title: string}): Promise<void> {
    const title = input.title.trim();
    if (!title || this.catalog.find(input.sessionId)?.title !== undefined) return;

    this.update(input.sessionId, (record) => (record.title === undefined ? {...record, title} : record));
  }

  public async touch(input: {readonly sessionId: string; readonly at: string}): Promise<void> {
    this.update(input.sessionId, (record) => (input.at > record.updatedAt ? {...record, updatedAt: input.at} : record));
  }

  public async pin(input: PinSessionPayload): Promise<void> {
    if (!this.catalog.find(input.sessionId)) throw new Error("Session not found.");

    this.update(input.sessionId, (record) => ({...record, pinned: input.pinned}));
  }

  public async archive(input: ArchiveSessionPayload): Promise<ArchiveSessionResult> {
    const {projectPath, sessionId} = input;
    if (!this.catalog.find(sessionId)) throw new ArchiveSessionError({message: "Session not found."});

    this.update(sessionId, (current) => {
      if (current.archivedAt !== undefined) throw new ArchiveSessionError({message: "Session is already archived."});
      return {...current, archivedAt: new Date().toISOString()};
    });

    return {projectPath, sessionId};
  }

  public view(
    {openId, projects}: {readonly projects: Readonly<Record<string, number>>; readonly openId: string | null},
    anchors: ReadonlyMap<string, string> = new Map()
  ): SessionsView {
    const running = Array.from(anchors.keys(), (id) => this.catalog.find(id)).filter((row): row is SessionRecord => row !== undefined && row.archivedAt === undefined);
    const sortAt = (row: SessionRecord) => anchors.get(row.id) ?? row.updatedAt;
    return {
      projects: Object.fromEntries(
        Object.entries(projects).map(([projectPath, depth]) => {
          const path = resolveProjectPath(projectPath);
          const active = running.filter((row) => row.projectPath === path);
          // Each active row can displace at most one idle row from the indexed prefix.
          let records = this.catalog.list({projectPath: path, limit: depth + 1 + active.length});
          if (active.length) {
            records = records.filter((row) => !anchors.has(row.id)).concat(active);
            records.sort((a, b) => Number(b.pinned) - Number(a.pinned) || sortAt(b).localeCompare(sortAt(a)) || Buffer.compare(Buffer.from(b.id), Buffer.from(a.id)));
          }
          return [projectPath, {depth, loading: false, items: records.slice(0, depth).map(toListedSession), hasMore: records.length > depth}];
        })
      ),
      open: openId === null ? null : listedUnlessArchived(this.catalog.find(openId)),
    };
  }

  public async search(input: SearchSessionsPayload): Promise<SearchSessionsResult> {
    if (input.projectPaths.length === 0) return {sessions: [], nextCursor: null};

    const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const records = this.catalog.search({query: input.text.trim(), projectPaths: input.projectPaths, limit: input.limit + 1, ...(after ? {after} : {})});

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

  public close(): void {
    this.catalog.close();
  }

  private update(sessionId: string, change: (record: SessionRecord) => SessionRecord): void {
    this.catalog.update(sessionId, change);
    this.changed();
  }

  private changed(): void {
    this.deps.revision.set(this.deps.revision.value + 1);
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
