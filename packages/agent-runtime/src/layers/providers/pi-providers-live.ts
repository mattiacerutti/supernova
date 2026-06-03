import {Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import {ProviderLoginSessions, ProviderLoginSessionsLive} from "@supernova/agent-runtime/layers/providers/internal/provider-login-sessions";
import {ProvidersService} from "@supernova/agent-runtime/services/providers-service";
import {listProviders} from "@supernova/agent-runtime/layers/providers/operations/list-providers";
import {logoutProvider} from "@supernova/agent-runtime/layers/providers/operations/logout-provider";
import {setProviderApiKey} from "@supernova/agent-runtime/layers/providers/operations/set-provider-api-key";
import {startProviderOAuthLogin} from "@supernova/agent-runtime/layers/providers/operations/start-provider-oauth-login";

export const PiProvidersFromInternal = Layer.effect(
  ProvidersService,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;
    const loginSessions = yield* ProviderLoginSessions;

    return {
      cancelLogin: loginSessions.cancel,
      list: () => listProviders().pipe(Effect.provideService(PiSdkService, piSdk)),
      logout: (providerId) => logoutProvider(providerId).pipe(Effect.provideService(PiSdkService, piSdk)),
      setApiKey: (providerId, apiKey) => setProviderApiKey(providerId, apiKey).pipe(Effect.provideService(PiSdkService, piSdk)),
      startOAuthLogin: (providerId) =>
        startProviderOAuthLogin(providerId).pipe(Effect.provideService(PiSdkService, piSdk), Effect.provideService(ProviderLoginSessions, loginSessions)),
      submitLoginInput: loginSessions.submitInput,
      watchLoginSession: loginSessions.watch,
    };
  })
);

export const PiProvidersLive = PiProvidersFromInternal.pipe(Layer.provide(ProviderLoginSessionsLive));
