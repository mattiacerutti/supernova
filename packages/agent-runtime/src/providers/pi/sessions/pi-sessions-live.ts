import {Effect, Layer, Stream} from "effect";
import {SessionsService} from "@pi-desktop/agent-runtime/services/sessions/sessions-service";
import {createSession} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/create-session";
import {getSession} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/get-session";
import {listSessionModels} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/list-session-models";
import {sendSessionMessage} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/send-session-message";
import {PiProviderSdkService} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";
import {PiSessionSdkService} from "@pi-desktop/agent-runtime/providers/pi/sessions/pi-session-sdk";

export const PiSessionsLive = Layer.effect(
  SessionsService,
  Effect.gen(function* () {
    const providerSdk = yield* PiProviderSdkService;
    const sessionSdk = yield* PiSessionSdkService;

    return {
      create: (projectPath) => createSession(projectPath).pipe(Effect.provideService(PiSessionSdkService, sessionSdk)),
      get: (sessionId) => getSession(sessionId).pipe(Effect.provideService(PiSessionSdkService, sessionSdk)),
      listModels: () => listSessionModels().pipe(Effect.provideService(PiProviderSdkService, providerSdk)),
      sendMessage: (input) => sendSessionMessage(input).pipe(Stream.provideService(PiProviderSdkService, providerSdk), Stream.provideService(PiSessionSdkService, sessionSdk)),
    };
  })
);
