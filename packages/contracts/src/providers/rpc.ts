import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  AgentProviderApiKeySetError,
  AgentProviderApiKeySetPayload,
  AgentProviderApiKeySetResult,
  AgentProviderLoginError,
  AgentProviderLoginCancelPayload,
  AgentProviderLoginInputSubmitPayload,
  AgentProviderLoginResult,
  AgentProviderLoginSessionGetPayload,
  AgentProviderLogoutError,
  AgentProviderLogoutPayload,
  AgentProviderLogoutResult,
  AgentProvidersListError,
  AgentProvidersListPayload,
  AgentProvidersListResult,
  AgentProviderOAuthLoginStartPayload,
} from "@pi-desktop/contracts/providers/procedures";

export const AgentProvidersListRpc = Rpc.make("listProviders", {
  error: AgentProvidersListError,
  payload: AgentProvidersListPayload,
  success: AgentProvidersListResult,
});

export const AgentProviderApiKeySetRpc = Rpc.make("setProviderApiKey", {
  error: AgentProviderApiKeySetError,
  payload: AgentProviderApiKeySetPayload,
  success: AgentProviderApiKeySetResult,
});

export const AgentProviderOAuthLoginStartRpc = Rpc.make("startProviderOAuthLogin", {
  error: AgentProviderLoginError,
  payload: AgentProviderOAuthLoginStartPayload,
  success: AgentProviderLoginResult,
});

export const AgentProviderLoginSessionGetRpc = Rpc.make("getProviderLoginSession", {
  error: AgentProviderLoginError,
  payload: AgentProviderLoginSessionGetPayload,
  success: AgentProviderLoginResult,
});

export const AgentProviderLoginInputSubmitRpc = Rpc.make("submitProviderLoginInput", {
  error: AgentProviderLoginError,
  payload: AgentProviderLoginInputSubmitPayload,
  success: AgentProviderLoginResult,
});

export const AgentProviderLoginCancelRpc = Rpc.make("cancelProviderLogin", {
  error: AgentProviderLoginError,
  payload: AgentProviderLoginCancelPayload,
  success: AgentProviderLoginResult,
});

export const AgentProviderLogoutRpc = Rpc.make("logoutProvider", {
  error: AgentProviderLogoutError,
  payload: AgentProviderLogoutPayload,
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
