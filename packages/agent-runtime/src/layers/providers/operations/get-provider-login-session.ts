import {Effect} from "effect";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import {getLoginSessionState, toLoginSession} from "@supernova/agent-runtime/layers/providers/lib/login-sessions";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

/** Gets the current state of a provider login session. */
export function getProviderLoginSession(loginSessionId: string) {
  return Effect.try({
    try: () => toLoginSession(getLoginSessionState(loginSessionId)),
    catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to get provider login session.")}),
  });
}
