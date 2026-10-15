import type {
  ProjectSessionArchivePayload,
  ProjectSessionArchiveResult,
  ProjectSessionPinPayload,
  ProjectSessionsListPayload,
  ProjectSessionsListResult,
  ProjectSessionsSearchPayload,
  ProjectSessionsSearchResult,
} from "@supernova/contracts/services/projects/procedures";
import {ProjectSessionArchiveError} from "@supernova/contracts/services/projects/procedures";
import {decodeCursor, encodeCursor, toSessionSummary} from "@supernova/agent-runtime/features/projects/lib/session-pages";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";

export interface ProjectsDeps {
  readonly store: Pick<SessionStore, "find" | "list" | "search" | "update">;
}

export class Projects {
  public constructor(private readonly deps: ProjectsDeps) {}

  public async listSessions(input: ProjectSessionsListPayload): Promise<ProjectSessionsListResult> {
    const {cursor, limit, projectPath} = input;
    // One row more than the page tells whether another page follows.
    const records = await this.deps.store.list({projectPath, limit: limit + 1, ...(cursor === undefined ? {} : {after: decodeCursor(cursor)})});
    const page = records.slice(0, limit);
    return {projectPath, sessions: page.map(toSessionSummary), nextCursor: records.length > limit ? encodeCursor(page.at(-1)!) : null};
  }

  public async searchSessions(input: ProjectSessionsSearchPayload): Promise<ProjectSessionsSearchResult> {
    const {cursor, limit, projectPaths, query} = input;
    if (projectPaths.length === 0) return {sessions: [], nextCursor: null};
    const records = await this.deps.store.search({query: query.trim(), projectPaths, limit: limit + 1, ...(cursor === undefined ? {} : {after: decodeCursor(cursor)})});
    const page = records.slice(0, limit);
    return {
      sessions: page.map((record) => ({...toSessionSummary(record), projectPath: record.projectPath})),
      nextCursor: records.length > limit ? encodeCursor(page.at(-1)!) : null,
    };
  }

  public async pinSession(input: ProjectSessionPinPayload): Promise<void> {
    if (!(await this.deps.store.find(input.sessionId))) throw new Error("Session not found.");
    await this.deps.store.update(input.sessionId, (record) => ({...record, pinned: input.pinned}));
  }

  public async archiveSession(input: ProjectSessionArchivePayload): Promise<ProjectSessionArchiveResult> {
    const {projectPath, sessionId} = input;
    const record = await this.deps.store.find(sessionId);
    if (!record) throw new ProjectSessionArchiveError({message: "Session not found."});
    if (record.archivedAt !== undefined) throw new ProjectSessionArchiveError({message: "Session is already archived."});
    await this.deps.store.update(sessionId, (current) => ({...current, archivedAt: new Date().toISOString()}));
    return {projectPath, sessionId};
  }
}
