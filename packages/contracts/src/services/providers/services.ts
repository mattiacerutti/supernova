import type {Reference} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import {
  ProviderLoginAnswerPayload,
  ProviderLoginAttemptPayload,
  ProviderLoginError,
  ProviderLoginStartPayload,
  ProviderLoginStartResult,
  ProviderLogoutPayload,
} from "@supernova/contracts/services/providers/procedures";
import type {LoginState, Provider} from "@supernova/contracts/services/providers/schemas";
import type {Errors} from "@supernova/contracts/lib/errors";
import {json, serverHost} from "@supernova/contracts/lib/protocol";

/** Its end cancels a running login, so hold it only while a screen can answer the login. */
export const ProvidersService = remote("supernova.providers", {
  version: 4,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      state: {
        providers: json<readonly Provider[]>(),
        login: json<LoginState | null>(),
      },
      methods: {
        start: method(ProviderLoginStartPayload, ProviderLoginStartResult),
        answer: method(ProviderLoginAnswerPayload),
        /** A login that finished first keeps its result. */
        cancel: method(ProviderLoginAttemptPayload),
        /** A working login stays; cancel it first. */
        dismiss: method(ProviderLoginAttemptPayload),
        logout: method(ProviderLogoutPayload),
      },
    },
  },
});

export const ProvidersErrors = {
  start: ProviderLoginError,
  answer: ProviderLoginError,
  logout: ProviderLoginError,
} satisfies Errors<typeof ProvidersService>;

export type ProvidersService = Reference<typeof ProvidersService>;
