import {Layer} from "effect";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";
import {archiveProjectSession} from "@pi-desktop/agent-runtime/providers/pi/projects/operations/archive-project-session";
import {listProjectSessions} from "@pi-desktop/agent-runtime/providers/pi/projects/operations/list-project-sessions";

export const PiProjectsLive = Layer.succeed(ProjectsService, {
  archiveSession: archiveProjectSession,
  listSessions: listProjectSessions,
});
