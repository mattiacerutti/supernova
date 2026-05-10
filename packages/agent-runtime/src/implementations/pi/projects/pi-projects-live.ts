import {Effect, Layer} from "effect";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";
import {archiveProjectSession} from "@pi-desktop/agent-runtime/implementations/pi/projects/operations/archive-project-session";
import {listProjectSessions} from "@pi-desktop/agent-runtime/implementations/pi/projects/operations/list-project-sessions";

export const PiProjectsLive = Layer.effect(
  ProjectsService,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      archiveSession: (projectPath, sessionId) => archiveProjectSession(projectPath, sessionId).pipe(Effect.provideService(PiSdkService, piSdk)),
      listSessions: (input) => listProjectSessions(input).pipe(Effect.provideService(PiSdkService, piSdk)),
    };
  })
);
