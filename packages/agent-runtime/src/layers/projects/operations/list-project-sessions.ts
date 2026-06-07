import {Effect} from "effect";
import {ProjectSessionsListError} from "@supernova/contracts/projects/procedures";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import {mapPiSessionsToSummaries} from "@supernova/agent-runtime/layers/projects/pi-session-mapper";

/** Lists all project session summaries newest-first for sidebar rendering. */
export function listProjectSessions(input: {projectPath: string}) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        // TODO: Watch for performance issues here. SessionManager.list eagerly parses every session; if that becomes slow, replace this with a custom solution.
        const sessions = await piSdk.SessionManager.list(input.projectPath);
        const sessionSummaries = mapPiSessionsToSummaries(sessions);

        return {
          projectPath: input.projectPath,
          sessions: sessionSummaries,
        };
      },
      catch: (cause) =>
        new ProjectSessionsListError({
          cause,
          message: cause instanceof Error ? cause.message : "Failed to list project sessions.",
        }),
    });
  });
}
