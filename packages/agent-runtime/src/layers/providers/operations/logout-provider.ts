import {Effect} from "effect";
import {ProviderLogoutError} from "@supernova/contracts/providers/procedures";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

/** Removes stored credentials for a provider and refreshes model auth state. */
export function logoutProvider(providerId: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.tryPromise({
      try: async () => {
        await piSdk.modelRuntime.logout(providerId);
        return {providerId};
      },
      catch: (cause) => new ProviderLogoutError({cause, message: errorMessage(cause, "Failed to disconnect provider.")}),
    });
  });
}
