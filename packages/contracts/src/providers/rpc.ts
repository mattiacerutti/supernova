import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  ProviderApiKeySetError,
  ProviderApiKeySetPayload,
  ProviderApiKeySetResult,
  ProviderLoginError,
  ProviderLoginCancelPayload,
  ProviderLoginInputSubmitPayload,
  ProviderLoginResult,
  ProviderLoginSessionGetPayload,
  ProviderLogoutError,
  ProviderLogoutPayload,
  ProviderLogoutResult,
  ProvidersListError,
  ProvidersListPayload,
  ProvidersListResult,
  ProviderOAuthLoginStartPayload,
} from "@pi-desktop/contracts/providers/procedures";

export const ProvidersListRpc = Rpc.make("listProviders", {
  error: ProvidersListError,
  payload: ProvidersListPayload,
  success: ProvidersListResult,
});

export const ProviderApiKeySetRpc = Rpc.make("setProviderApiKey", {
  error: ProviderApiKeySetError,
  payload: ProviderApiKeySetPayload,
  success: ProviderApiKeySetResult,
});

export const ProviderOAuthLoginStartRpc = Rpc.make("startProviderOAuthLogin", {
  error: ProviderLoginError,
  payload: ProviderOAuthLoginStartPayload,
  success: ProviderLoginResult,
});

export const ProviderLoginSessionGetRpc = Rpc.make("getProviderLoginSession", {
  error: ProviderLoginError,
  payload: ProviderLoginSessionGetPayload,
  success: ProviderLoginResult,
});

export const ProviderLoginInputSubmitRpc = Rpc.make("submitProviderLoginInput", {
  error: ProviderLoginError,
  payload: ProviderLoginInputSubmitPayload,
  success: ProviderLoginResult,
});

export const ProviderLoginCancelRpc = Rpc.make("cancelProviderLogin", {
  error: ProviderLoginError,
  payload: ProviderLoginCancelPayload,
  success: ProviderLoginResult,
});

export const ProviderLogoutRpc = Rpc.make("logoutProvider", {
  error: ProviderLogoutError,
  payload: ProviderLogoutPayload,
  success: ProviderLogoutResult,
});

export const ProviderRpcs = [
  ProvidersListRpc,
  ProviderApiKeySetRpc,
  ProviderOAuthLoginStartRpc,
  ProviderLoginSessionGetRpc,
  ProviderLoginInputSubmitRpc,
  ProviderLoginCancelRpc,
  ProviderLogoutRpc,
] as const;
