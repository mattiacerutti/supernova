import {existsSync} from "node:fs";
import {mkdir, rename} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {Effect, Layer} from "effect";
import {AgentProjectSessionArchiveError, AgentProjectSessionsListError} from "@pi-desktop/contracts/projects";
import {SessionManager} from "@mariozechner/pi-coding-agent";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";
import {mapPiSessionsToChats} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-session-mapper";

const ARCHIVE_DIR_NAME = "archive";

export const PiProjectsLive = Layer.succeed(ProjectsService, {
  archiveSession: (projectPath, sessionId) =>
    Effect.tryPromise({
      try: async () => {
        const sessions = await SessionManager.list(projectPath);
        const session = sessions.find((candidate) => candidate.id === sessionId);
        if (!session) throw new Error("Session not found.");

        const archiveDir = join(dirname(session.path), ARCHIVE_DIR_NAME);
        const archivePath = join(archiveDir, basename(session.path));
        if (existsSync(archivePath)) throw new Error("Archived session already exists.");

        await mkdir(archiveDir, {recursive: true});
        await rename(session.path, archivePath);

        return {projectPath, sessionId};
      },
      catch: (cause) =>
        new AgentProjectSessionArchiveError({
          cause,
          message: cause instanceof Error ? cause.message : "Failed to archive project session.",
        }),
    }),
  listSessions: (projectPath) =>
    Effect.tryPromise({
      try: async () => {
        const sessions = await SessionManager.list(projectPath);
        return {
          projectPath,
          sessions: mapPiSessionsToChats(sessions),
        };
      },
      catch: (cause) =>
        new AgentProjectSessionsListError({
          cause,
          message: cause instanceof Error ? cause.message : "Failed to list project sessions.",
        }),
    }),
});
