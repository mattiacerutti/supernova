import {Effect, Layer} from "effect";
import {ProvidersService} from "@pi-desktop/agent-runtime/services/providers/providers-service";
import {cancelProviderLogin} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/cancel-provider-login";
import {getProviderLoginSession} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/get-provider-login-session";
import {listProviders} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/list-providers";
import {logoutProvider} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/logout-provider";
import {setProviderApiKey} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/set-provider-api-key";
import {startProviderOAuthLogin} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/start-provider-oauth-login";
import {submitProviderLoginInput} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/submit-provider-login-input";
import {PiProviderSdkService} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";

export const PiProvidersLive = Layer.effect(
  ProvidersService,
  Effect.gen(function* () {
    const providerSdk = yield* PiProviderSdkService;

    return {
      cancelLogin: cancelProviderLogin,
      getLoginSession: getProviderLoginSession,
      list: () => listProviders().pipe(Effect.provideService(PiProviderSdkService, providerSdk)),
      logout: (providerId) => logoutProvider(providerId).pipe(Effect.provideService(PiProviderSdkService, providerSdk)),
      setApiKey: (providerId, apiKey) => setProviderApiKey(providerId, apiKey).pipe(Effect.provideService(PiProviderSdkService, providerSdk)),
      startOAuthLogin: (providerId) => startProviderOAuthLogin(providerId).pipe(Effect.provideService(PiProviderSdkService, providerSdk)),
      submitLoginInput: submitProviderLoginInput,
    };
  })
);
