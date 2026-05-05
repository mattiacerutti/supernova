import {existsSync} from "node:fs";
import {mkdir, rename} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {SessionManager} from "@mariozechner/pi-coding-agent";
import {Effect} from "effect";
import {AgentProjectSessionArchiveError} from "@pi-desktop/contracts/projects";

const ARCHIVE_DIR_NAME = "archive";

export function archiveProjectSession(projectPath: string, sessionId: string) {
  return Effect.tryPromise({
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
  });
}
