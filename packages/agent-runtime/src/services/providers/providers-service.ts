import {Context, Effect} from "effect";
import type {
  AgentProviderApiKeySetError,
  AgentProviderLoginError,
  AgentProviderLogoutError,
  AgentProvidersListError,
  IAgentProviderApiKeySetResult,
  IAgentProviderLogoutResult,
  IAgentProvidersListResult,
} from "@pi-desktop/contracts/providers/procedures";
import type {IAgentProviderLoginSession} from "@pi-desktop/contracts/providers/schemas";

export interface IProvidersService {
  readonly list: () => Effect.Effect<IAgentProvidersListResult, AgentProvidersListError>;
  readonly cancelLogin: (loginSessionId: string) => Effect.Effect<IAgentProviderLoginSession, AgentProviderLoginError>;
  readonly getLoginSession: (loginSessionId: string) => Effect.Effect<IAgentProviderLoginSession, AgentProviderLoginError>;
  readonly logout: (providerId: string) => Effect.Effect<IAgentProviderLogoutResult, AgentProviderLogoutError>;
  readonly setApiKey: (providerId: string, apiKey: string) => Effect.Effect<IAgentProviderApiKeySetResult, AgentProviderApiKeySetError>;
  readonly startOAuthLogin: (providerId: string) => Effect.Effect<IAgentProviderLoginSession, AgentProviderLoginError>;
  readonly submitLoginInput: (loginSessionId: string, input: string) => Effect.Effect<IAgentProviderLoginSession, AgentProviderLoginError>;
}

export class ProvidersService extends Context.Service<ProvidersService, IProvidersService>()("pi-desktop/agent-runtime/ProvidersService") {}
