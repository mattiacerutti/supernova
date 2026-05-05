import {Effect} from "effect";
import {AgentProviderLoginError} from "@pi-desktop/contracts/providers";
import {errorMessage, getLoginSessionState, toLoginSession} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";

export function getProviderLoginSession(loginSessionId: string) {
  return Effect.try({
    try: () => toLoginSession(getLoginSessionState(loginSessionId)),
    catch: (cause) => new AgentProviderLoginError({cause, message: errorMessage(cause, "Failed to get provider login session.")}),
  });
}
