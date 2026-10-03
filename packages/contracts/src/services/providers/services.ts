import type {Context, ReplicatedState} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {
  ProviderLoginCancelPayload,
  ProviderLoginError,
  ProviderLoginInputSubmitPayload,
  ProviderLoginResult,
  ProviderLoginStartPayload,
  ProviderLogoutPayload,
  ProviderLogoutResult,
  ProvidersListResult,
} from "@supernova/contracts/services/providers/procedures";
import type {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";

export interface ProviderLoginsState {
  /** Logins started since the server started, keyed by login session id, at their latest step. */
  readonly logins: Readonly<Record<string, ProviderLoginSession>>;
}

/** Model providers, their credentials, and interactive logins. */
export interface ProvidersService {
  /** Every login's current step; a login's client follows its own entry. */
  readonly logins: ReplicatedState<ProviderLoginsState>;
  list(context: Context): Promise<ServiceResult<ProvidersListResult>>;
  logout(payload: ProviderLogoutPayload, context: Context): Promise<ServiceResult<ProviderLogoutResult>>;
  /** Starts a provider-owned login and returns once it shows its first step. */
  startLogin(payload: ProviderLoginStartPayload, context: Context): Promise<ServiceResult<ProviderLoginResult, ProviderLoginError>>;
  submitLoginInput(payload: ProviderLoginInputSubmitPayload, context: Context): Promise<ServiceResult<ProviderLoginResult, ProviderLoginError>>;
  cancelLogin(payload: ProviderLoginCancelPayload, context: Context): Promise<ServiceResult<ProviderLoginResult, ProviderLoginError>>;
}

export const ProvidersService = defineService<ProvidersService>("supernova.providers");
