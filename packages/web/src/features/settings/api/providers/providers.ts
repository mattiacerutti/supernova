import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useHold, useWatch} from "@earendil-works/chord/react";
import type {ProviderLoginAnswerPayload, ProviderLoginAttemptPayload, ProviderLoginStartPayload, ProviderLogoutPayload} from "@supernova/contracts/services/providers/procedures";
import {ProvidersService} from "@supernova/contracts/services/providers/services";

export function useProviders() {
  const service = useHold(ProvidersService, {});
  const require = () => {
    if (!service) throw new Error("The providers are not connected yet.");
    return service;
  };

  return {
    providers: useWatch(service?.providers),
    login: useWatch(service?.login),
    start: (input: ProviderLoginStartPayload) => require().start(input, context),
    answer: (input: ProviderLoginAnswerPayload) => require().answer(input, context),
    cancel: (input: ProviderLoginAttemptPayload) => require().cancel(input, context),
    dismiss: (input: ProviderLoginAttemptPayload) => require().dismiss(input, context),
    logout: (input: ProviderLogoutPayload) => require().logout(input, context),
  };
}
