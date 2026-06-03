import {Context, Effect} from "effect";
import type {Stream} from "effect";
import type {
  ProviderApiKeySetError,
  ProviderLoginError,
  ProviderLogoutError,
  ProvidersListError,
  ProviderApiKeySetResult,
  ProviderLogoutResult,
  ProvidersListResult,
} from "@supernova/contracts/providers/procedures";
import type {ProviderLoginSession} from "@supernova/contracts/providers/schemas";

export interface ProvidersServiceShape {
  readonly list: () => Effect.Effect<ProvidersListResult, ProvidersListError>;
  readonly cancelLogin: (loginSessionId: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly logout: (providerId: string) => Effect.Effect<ProviderLogoutResult, ProviderLogoutError>;
  readonly setApiKey: (providerId: string, apiKey: string) => Effect.Effect<ProviderApiKeySetResult, ProviderApiKeySetError>;
  readonly startOAuthLogin: (providerId: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly submitLoginInput: (loginSessionId: string, input: string) => Effect.Effect<ProviderLoginSession, ProviderLoginError>;
  readonly watchLoginSession: (loginSessionId: string) => Stream.Stream<ProviderLoginSession, ProviderLoginError>;
}

export class ProvidersService extends Context.Service<ProvidersService, ProvidersServiceShape>()("supernova/agent-runtime/ProvidersService") {}
