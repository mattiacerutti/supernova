import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
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
import {json, NO_PAYLOAD, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";

export interface ProviderLoginsState {
  /** Logins started since the server started, keyed by login session id, at their latest step. */
  readonly logins: Readonly<Record<string, ProviderLoginSession>>;
}

/** Model providers, their credentials, and interactive logins. */
export const ProvidersService = remote("supernova.providers", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      state: {
        /** Every login's current step; a login's client follows its own entry. */
        logins: json<ProviderLoginsState>(),
      },
      methods: {
        list: method(NO_PAYLOAD, result<ProvidersListResult>()),
        logout: method(json<ProviderLogoutPayload>(), result<ProviderLogoutResult>()),
        /** Starts a provider-owned login and returns once it shows its first step. */
        startLogin: method(json<ProviderLoginStartPayload>(), result<ProviderLoginResult, ProviderLoginError>()),
        submitLoginInput: method(json<ProviderLoginInputSubmitPayload>(), result<ProviderLoginResult, ProviderLoginError>()),
        cancelLogin: method(json<ProviderLoginCancelPayload>(), result<ProviderLoginResult, ProviderLoginError>()),
      },
    },
  },
});

export type ProvidersService = MembersOf<typeof ProvidersService>;
