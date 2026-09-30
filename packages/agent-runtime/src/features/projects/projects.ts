import {existsSync} from "node:fs";
import {mkdir, rename} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import type {ProjectSessionArchivePayload, ProjectSessionArchiveResult, ProjectSessionsListPayload, ProjectSessionsListResult} from "@supernova/contracts/projects/procedures";
import {ProjectSessionArchiveError} from "@supernova/contracts/projects/procedures";
import {toSessionSummaries} from "@supernova/agent-runtime/features/projects/lib/map-session-summaries";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

const ARCHIVE_DIR_NAME = "archive";

export interface ProjectsDeps {
  readonly sdk: Pick<PiSdk, "SessionManager">;
}

/** Sessions as they appear grouped by project in the sidebar. */
export class Projects {
  public constructor(private readonly deps: ProjectsDeps) {}

  /** Lists all project session summaries newest-first for sidebar rendering. */
  public async listSessions(input: ProjectSessionsListPayload): Promise<ProjectSessionsListResult> {
    // SessionManager.list eagerly parses every session file; revisit if projects grow large enough for this to show.
    const sessions = await this.deps.sdk.SessionManager.list(input.projectPath);
    return {projectPath: input.projectPath, sessions: toSessionSummaries(sessions, input.projectPath)};
  }

  /** Archives a project session by moving its backing session file out of Pi's listing. */
  public async archiveSession(input: ProjectSessionArchivePayload): Promise<ProjectSessionArchiveResult> {
    const {projectPath, sessionId} = input;
    const sessions = await this.deps.sdk.SessionManager.list(projectPath);
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new ProjectSessionArchiveError({message: "Session not found."});

    const archiveDir = join(dirname(session.path), ARCHIVE_DIR_NAME);
    const archivePath = join(archiveDir, basename(session.path));
    if (existsSync(archivePath)) throw new ProjectSessionArchiveError({message: "Archived session already exists."});

    await mkdir(archiveDir, {recursive: true});
    await rename(session.path, archivePath);
    return {projectPath, sessionId};
  }
}
