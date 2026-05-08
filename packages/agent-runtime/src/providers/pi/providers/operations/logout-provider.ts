import {Effect} from "effect";
import {AgentProviderLogoutError} from "@pi-desktop/contracts/providers";
import {PiProviderSdkService} from "@pi-desktop/agent-runtime/providers/pi/providers/pi-provider-sdk";
import {errorMessage} from "@pi-desktop/agent-runtime/providers/pi/providers/lib/provider-errors";

export function logoutProvider(providerId: string) {
  return Effect.gen(function* () {
    const providerSdk = yield* PiProviderSdkService;

    return yield* Effect.try({
      try: () => {
        providerSdk.authStorage.logout(providerId);
        providerSdk.modelRegistry.refresh();
        return {providerId};
      },
      catch: (cause) => new AgentProviderLogoutError({cause, message: errorMessage(cause, "Failed to disconnect provider.")}),
    });
  });
}
