import {Effect} from "effect";
import {AgentProviderLogoutError} from "@pi-desktop/contracts/providers";
import {authStorage, errorMessage, modelRegistry} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";

export function logoutProvider(providerId: string) {
  return Effect.try({
    try: () => {
      authStorage.logout(providerId);
      modelRegistry.refresh();
      return {providerId};
    },
    catch: (cause) => new AgentProviderLogoutError({cause, message: errorMessage(cause, "Failed to disconnect provider.")}),
  });
}
