import {Effect} from "effect";
import {ProviderLogoutError} from "@supernova/contracts/providers/procedures";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

/** Removes stored credentials for a provider and refreshes model auth state. */
export function logoutProvider(providerId: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.try({
      try: () => {
        piSdk.authStorage.logout(providerId);
        piSdk.modelRegistry.refresh();
        return {providerId};
      },
      catch: (cause) => new ProviderLogoutError({cause, message: errorMessage(cause, "Failed to disconnect provider.")}),
    });
  });
}
