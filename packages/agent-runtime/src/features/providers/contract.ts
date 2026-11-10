import {local, method} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {ProviderLoginResult, ProviderLogoutResult, ProvidersListResult} from "@supernova/contracts/services/providers/procedures";
import {ProviderLoginCancelPayload, ProviderLoginInputSubmitPayload, ProviderLoginStartPayload, ProviderLogoutPayload} from "@supernova/contracts/services/providers/procedures";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";

export const ProvidersStore = local("supernova.store.providers", {
  version: 1,
  params: {},
  members: {
    logins: json<ProviderLoginsState>(),
    list: method(undefined, json<ProvidersListResult>()),
    logout: method(ProviderLogoutPayload, json<ProviderLogoutResult>()),
    startLogin: method(ProviderLoginStartPayload, json<ProviderLoginResult>()),
    submitLoginInput: method(ProviderLoginInputSubmitPayload, json<ProviderLoginResult>()),
    cancelLogin: method(ProviderLoginCancelPayload, json<ProviderLoginResult>()),
  },
});
