import {Effect} from "effect";
import {ProviderLoginError} from "@pi-desktop/contracts/providers/procedures";
import {getLoginSessionState, toLoginSession} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/login-sessions";
import {errorMessage} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/provider-errors";

export function getProviderLoginSession(loginSessionId: string) {
  return Effect.try({
    try: () => toLoginSession(getLoginSessionState(loginSessionId)),
    catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to get provider login session.")}),
  });
}
