import type {Reference} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {ProviderLoginResult, ProviderLogoutResult, ProvidersListResult} from "@supernova/contracts/services/providers/procedures";
import {ProviderLoginError} from "@supernova/contracts/services/providers/procedures";
import {ProviderLoginCancelPayload, ProviderLoginInputSubmitPayload, ProviderLoginStartPayload, ProviderLogoutPayload} from "@supernova/contracts/services/providers/procedures";
import type {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import type {Errors} from "@supernova/contracts/lib/errors";
import {json, serverHost} from "@supernova/contracts/lib/protocol";

export interface ProviderLoginsState {
  readonly logins: Readonly<Record<string, ProviderLoginSession>>;
}

export const ProvidersService = remote("supernova.providers", {
  version: 3,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      state: {
        logins: json<ProviderLoginsState>(),
      },
      methods: {
        list: method(undefined, json<ProvidersListResult>()),
        logout: method(ProviderLogoutPayload, json<ProviderLogoutResult>()),
        startLogin: method(ProviderLoginStartPayload, json<ProviderLoginResult>()),
        submitLoginInput: method(ProviderLoginInputSubmitPayload, json<ProviderLoginResult>()),
        cancelLogin: method(ProviderLoginCancelPayload, json<ProviderLoginResult>()),
      },
    },
  },
});

export const ProvidersErrors = {
  startLogin: ProviderLoginError,
  submitLoginInput: ProviderLoginError,
  cancelLogin: ProviderLoginError,
} satisfies Errors<typeof ProvidersService>;

export type ProvidersService = Reference<typeof ProvidersService>;
