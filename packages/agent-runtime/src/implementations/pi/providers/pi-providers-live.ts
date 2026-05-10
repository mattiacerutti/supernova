import {Effect, Layer} from "effect";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {ProvidersService} from "@pi-desktop/agent-runtime/services/providers/providers-service";
import {cancelProviderLogin} from "@pi-desktop/agent-runtime/implementations/pi/providers/operations/cancel-provider-login";
import {getProviderLoginSession} from "@pi-desktop/agent-runtime/implementations/pi/providers/operations/get-provider-login-session";
import {listProviders} from "@pi-desktop/agent-runtime/implementations/pi/providers/operations/list-providers";
import {logoutProvider} from "@pi-desktop/agent-runtime/implementations/pi/providers/operations/logout-provider";
import {setProviderApiKey} from "@pi-desktop/agent-runtime/implementations/pi/providers/operations/set-provider-api-key";
import {startProviderOAuthLogin} from "@pi-desktop/agent-runtime/implementations/pi/providers/operations/start-provider-oauth-login";
import {submitProviderLoginInput} from "@pi-desktop/agent-runtime/implementations/pi/providers/operations/submit-provider-login-input";

export const PiProvidersLive = Layer.effect(
  ProvidersService,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      cancelLogin: cancelProviderLogin,
      getLoginSession: getProviderLoginSession,
      list: () => listProviders().pipe(Effect.provideService(PiSdkService, piSdk)),
      logout: (providerId) => logoutProvider(providerId).pipe(Effect.provideService(PiSdkService, piSdk)),
      setApiKey: (providerId, apiKey) => setProviderApiKey(providerId, apiKey).pipe(Effect.provideService(PiSdkService, piSdk)),
      startOAuthLogin: (providerId) => startProviderOAuthLogin(providerId).pipe(Effect.provideService(PiSdkService, piSdk)),
      submitLoginInput: submitProviderLoginInput,
    };
  })
);
