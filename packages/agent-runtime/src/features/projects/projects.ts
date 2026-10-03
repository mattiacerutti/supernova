import type {
  ProjectSessionArchivePayload,
  ProjectSessionArchiveResult,
  ProjectSessionsListPayload,
  ProjectSessionsListResult,
} from "@supernova/contracts/services/projects/procedures";
import {ProjectSessionArchiveError} from "@supernova/contracts/services/projects/procedures";
import {newestFirst, toSessionSummary} from "@supernova/agent-runtime/features/projects/lib/map-session-summaries";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";
import {archiveLegacySession, listLegacySessions} from "@supernova/agent-runtime/pi/lib/session/legacy-sessions";

export interface ProjectsDeps {
  readonly store: Pick<SessionStore, "find" | "list" | "update">;
}

/** Sessions as they appear grouped by project in the sidebar. */
export class Projects {
  public constructor(private readonly deps: ProjectsDeps) {}

  /** Lists a project's sessions newest-first from the catalog, plus its read-only legacy sessions. */
  public async listSessions(input: ProjectSessionsListPayload): Promise<ProjectSessionsListResult> {
    const [records, legacy] = await Promise.all([this.deps.store.list(input.projectPath), listLegacySessions(input.projectPath)]);
    return {projectPath: input.projectPath, sessions: newestFirst([...records.map(toSessionSummary), ...legacy])};
  }

  /** Archives a project session: it leaves the listing and its file stays. A legacy file moves to `archive/` as before. */
  public async archiveSession(input: ProjectSessionArchivePayload): Promise<ProjectSessionArchiveResult> {
    const {projectPath, sessionId} = input;
    const record = await this.deps.store.find(sessionId);
    if (record) {
      if (record.archivedAt !== undefined) throw new ProjectSessionArchiveError({message: "Session is already archived."});
      await this.deps.store.update(sessionId, (current) => ({...current, archivedAt: new Date().toISOString()}));
      return {projectPath, sessionId};
    }

    const archived = await archiveLegacySession(projectPath, sessionId);
    if (archived !== "archived") throw new ProjectSessionArchiveError({message: archived === "exists" ? "Archived session already exists." : "Session not found."});
    return {projectPath, sessionId};
  }
}
