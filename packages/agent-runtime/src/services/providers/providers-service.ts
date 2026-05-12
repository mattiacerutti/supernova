import {Context, Effect} from "effect";
import type {
  AgentProviderApiKeySetError,
  AgentProviderLoginError,
  AgentProviderLogoutError,
  AgentProvidersListError,
  AgentProviderApiKeySetResult,
  AgentProviderLogoutResult,
  AgentProvidersListResult,
} from "@pi-desktop/contracts/providers/procedures";
import type {AgentProviderLoginSession} from "@pi-desktop/contracts/providers/schemas";

export interface ProvidersServiceShape {
  readonly list: () => Effect.Effect<AgentProvidersListResult, AgentProvidersListError>;
  readonly cancelLogin: (loginSessionId: string) => Effect.Effect<AgentProviderLoginSession, AgentProviderLoginError>;
  readonly getLoginSession: (loginSessionId: string) => Effect.Effect<AgentProviderLoginSession, AgentProviderLoginError>;
  readonly logout: (providerId: string) => Effect.Effect<AgentProviderLogoutResult, AgentProviderLogoutError>;
  readonly setApiKey: (providerId: string, apiKey: string) => Effect.Effect<AgentProviderApiKeySetResult, AgentProviderApiKeySetError>;
  readonly startOAuthLogin: (providerId: string) => Effect.Effect<AgentProviderLoginSession, AgentProviderLoginError>;
  readonly submitLoginInput: (loginSessionId: string, input: string) => Effect.Effect<AgentProviderLoginSession, AgentProviderLoginError>;
}

export class ProvidersService extends Context.Service<ProvidersService, ProvidersServiceShape>()("pi-desktop/agent-runtime/ProvidersService") {}
