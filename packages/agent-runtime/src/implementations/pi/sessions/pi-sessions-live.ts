import {Effect, Layer, Stream} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {SessionsService} from "@supernova/agent-runtime/services/sessions/sessions-service";
import {createSession} from "@supernova/agent-runtime/implementations/pi/sessions/operations/create-session";
import {getSession} from "@supernova/agent-runtime/implementations/pi/sessions/operations/get-session";
import {listComposerSuggestions} from "@supernova/agent-runtime/implementations/pi/sessions/operations/list-composer-suggestions";
import {listSessionModels} from "@supernova/agent-runtime/implementations/pi/sessions/operations/list-session-models";
import {sendSessionMessage} from "@supernova/agent-runtime/implementations/pi/sessions/operations/send-session-message";

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
