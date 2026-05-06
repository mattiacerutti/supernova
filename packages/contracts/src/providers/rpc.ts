import * as Rpc from "effect/unstable/rpc/Rpc";
import {Schema} from "effect";
import {
  AgentProviderApiKeySetError,
  AgentProviderApiKeySetResult,
  AgentProviderLoginError,
  AgentProviderLoginSession,
  AgentProviderLogoutError,
  AgentProviderLogoutResult,
  AgentProvidersListError,
  AgentProvidersListResult,
} from "@pi-desktop/contracts/providers";

export const AgentProvidersListRpc = Rpc.make("listProviders", {
  error: AgentProvidersListError,
  payload: Schema.Void,
  success: AgentProvidersListResult,
});

export const AgentProviderApiKeySetRpc = Rpc.make("setProviderApiKey", {
  error: AgentProviderApiKeySetError,
  payload: Schema.Struct({
    apiKey: Schema.String,
    providerId: Schema.String,
  }),
  success: AgentProviderApiKeySetResult,
});

export const AgentProviderOAuthLoginStartRpc = Rpc.make("startProviderOAuthLogin", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    providerId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLoginSessionGetRpc = Rpc.make("getProviderLoginSession", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    loginSessionId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLoginInputSubmitRpc = Rpc.make("submitProviderLoginInput", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    input: Schema.String,
    loginSessionId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLoginCancelRpc = Rpc.make("cancelProviderLogin", {
  error: AgentProviderLoginError,
  payload: Schema.Struct({
    loginSessionId: Schema.String,
  }),
  success: AgentProviderLoginSession,
});

export const AgentProviderLogoutRpc = Rpc.make("logoutProvider", {
  error: AgentProviderLogoutError,
  payload: Schema.Struct({
    providerId: Schema.String,
  }),
  success: AgentProviderLogoutResult,
});

export const AgentProviderRpcs = [
  AgentProvidersListRpc,
  AgentProviderApiKeySetRpc,
  AgentProviderOAuthLoginStartRpc,
  AgentProviderLoginSessionGetRpc,
  AgentProviderLoginInputSubmitRpc,
  AgentProviderLoginCancelRpc,
  AgentProviderLogoutRpc,
] as const;
