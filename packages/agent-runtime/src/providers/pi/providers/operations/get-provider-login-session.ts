import {Effect} from "effect";
import {AgentProviderLoginError} from "@pi-desktop/contracts/providers";
import {getLoginSessionState, toLoginSession} from "@pi-desktop/agent-runtime/providers/pi/providers/lib/login-sessions";
import {errorMessage} from "@pi-desktop/agent-runtime/providers/pi/providers/lib/provider-errors";

export function getProviderLoginSession(loginSessionId: string) {
  return Effect.try({
    try: () => toLoginSession(getLoginSessionState(loginSessionId)),
    catch: (cause) => new AgentProviderLoginError({cause, message: errorMessage(cause, "Failed to get provider login session.")}),
  });
}
