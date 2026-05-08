import {Effect} from "effect";
import {AgentProviderLoginError} from "@pi-desktop/contracts/providers";
import {getLoginSessionState, toLoginSession} from "@pi-desktop/agent-runtime/providers/pi/providers/lib/login-sessions";
import {errorMessage} from "@pi-desktop/agent-runtime/providers/pi/providers/lib/provider-errors";

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
    catch: (cause) => new AgentProviderLoginError({cause, message: errorMessage(cause, "Failed to cancel provider login.")}),
  });
}
