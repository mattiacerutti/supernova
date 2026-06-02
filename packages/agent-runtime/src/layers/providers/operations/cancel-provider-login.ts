import {Effect} from "effect";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import {getLoginSessionState, toLoginSession} from "@supernova/agent-runtime/layers/providers/lib/login-sessions";
import {errorMessage} from "@supernova/agent-runtime/layers/providers/lib/provider-errors";

/** Cancels a pending provider login session. */
export function cancelProviderLogin(loginSessionId: string) {
  return Effect.try({
    try: () => {
      const session = getLoginSessionState(loginSessionId);
      session.abortController.abort();
      session.waiter?.reject(new Error("Login cancelled"));
      session.waiter = undefined;
      session.status = "cancelled";
      return toLoginSession(session);
    },
    catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to cancel provider login.")}),
  });
}
