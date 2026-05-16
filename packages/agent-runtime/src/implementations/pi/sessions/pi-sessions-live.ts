import {Effect, Layer, Stream} from "effect";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {SessionsService} from "@pi-desktop/agent-runtime/services/sessions/sessions-service";
import {createSession} from "@pi-desktop/agent-runtime/implementations/pi/sessions/operations/create-session";
import {getSession} from "@pi-desktop/agent-runtime/implementations/pi/sessions/operations/get-session";
import {listComposerSuggestions} from "@pi-desktop/agent-runtime/implementations/pi/sessions/operations/list-composer-suggestions";
import {listSessionModels} from "@pi-desktop/agent-runtime/implementations/pi/sessions/operations/list-session-models";
import {sendSessionMessage} from "@pi-desktop/agent-runtime/implementations/pi/sessions/operations/send-session-message";

export const PiSessionsLive = Layer.effect(
  SessionsService,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      create: (projectPath) => createSession(projectPath).pipe(Effect.provideService(PiSdkService, piSdk)),
      get: (sessionId) => getSession(sessionId).pipe(Effect.provideService(PiSdkService, piSdk)),
      listComposerSuggestions: listComposerSuggestions,
      listModels: () => listSessionModels().pipe(Effect.provideService(PiSdkService, piSdk)),
      sendMessage: (input) => sendSessionMessage(input).pipe(Stream.provideService(PiSdkService, piSdk)),
    };
  })
);
