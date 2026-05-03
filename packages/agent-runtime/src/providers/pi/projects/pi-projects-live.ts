import {Effect, Layer} from "effect";
import {AgentProjectsListError} from "@pi-desktop/contracts";
import {SessionManager} from "@mariozechner/pi-coding-agent";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";
import {groupPiSessionsByProject} from "@pi-desktop/agent-runtime/providers/pi/projects/pi-session-mapper";

export const PiProjectsLive = Layer.succeed(ProjectsService, {
  list: Effect.tryPromise({
    try: async () => {
      const sessions = await SessionManager.listAll();
      return {projects: groupPiSessionsByProject(sessions)};
    },
    catch: (cause) =>
      new AgentProjectsListError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to list agent projects.",
      }),
  }),
});
