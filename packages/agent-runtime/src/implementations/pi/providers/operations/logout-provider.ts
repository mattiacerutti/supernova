import {Effect} from "effect";
import {AgentProviderLogoutError} from "@pi-desktop/contracts/providers/procedures";
import {PiSdkService} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import {errorMessage} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/provider-errors";

export function logoutProvider(providerId: string) {
  return Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return yield* Effect.try({
      try: () => {
        piSdk.authStorage.logout(providerId);
        piSdk.modelRegistry.refresh();
        return {providerId};
      },
      catch: (cause) => new AgentProviderLogoutError({cause, message: errorMessage(cause, "Failed to disconnect provider.")}),
    });
  });
}
