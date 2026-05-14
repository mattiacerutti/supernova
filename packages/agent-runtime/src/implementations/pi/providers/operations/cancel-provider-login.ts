import {Effect} from "effect";
import {ProviderLoginError} from "@pi-desktop/contracts/providers/procedures";
import {getLoginSessionState, toLoginSession} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/login-sessions";
import {errorMessage} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/provider-errors";

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
