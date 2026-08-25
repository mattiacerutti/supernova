import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  ProviderLoginError,
  ProviderLoginCancelPayload,
  ProviderLoginInputSubmitPayload,
  ProviderLoginResult,
  ProviderLoginWatchPayload,
  ProviderLogoutError,
  ProviderLogoutPayload,
  ProviderLogoutResult,
  ProvidersListError,
  ProvidersListPayload,
  ProvidersListResult,
  ProviderLoginStartPayload,
} from "@supernova/contracts/providers/procedures";

export const ProvidersListRpc = Rpc.make("listProviders", {
  error: ProvidersListError,
  payload: ProvidersListPayload,
  success: ProvidersListResult,
});

export const ProviderLoginStartRpc = Rpc.make("startProviderLogin", {
  error: ProviderLoginError,
  payload: ProviderLoginStartPayload,
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

export const ProviderLoginWatchRpc = Rpc.make("watchProviderLoginSession", {
  error: ProviderLoginError,
  payload: ProviderLoginWatchPayload,
  stream: true,
  success: ProviderLoginResult,
});

export const ProviderLogoutRpc = Rpc.make("logoutProvider", {
  error: ProviderLogoutError,
  payload: ProviderLogoutPayload,
  success: ProviderLogoutResult,
});

export const ProviderRpcs = [ProvidersListRpc, ProviderLoginStartRpc, ProviderLoginInputSubmitRpc, ProviderLoginCancelRpc, ProviderLoginWatchRpc, ProviderLogoutRpc] as const;
