import {Effect, Layer} from "effect";
import {AgentProjectSessionsListError} from "@pi-desktop/contracts/projects";
import {SessionManager} from "@mariozechner/pi-coding-agent";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";
import {mapPiSessionsToChats} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-session-mapper";

export const PiProjectsLive = Layer.succeed(ProjectsService, {
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
