import {existsSync} from "node:fs";
import {mkdir, rename} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {Effect} from "effect";
import {ProjectSessionArchiveError} from "@pi-desktop/contracts/projects/procedures";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";

const ARCHIVE_DIR_NAME = "archive";

export function archiveProjectSession(projectPath: string, sessionId: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        const sessions = await piSdk.SessionManager.list(projectPath);
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
        new ProjectSessionArchiveError({
          cause,
          message: cause instanceof Error ? cause.message : "Failed to archive project session.",
        }),
    });
  });
}
