import {Effect} from "effect";
import {ProviderLoginError} from "@pi-desktop/contracts/providers/procedures";
import {getLoginSessionState, toLoginSession} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/login-sessions";
import {errorMessage} from "@pi-desktop/agent-runtime/implementations/pi/providers/lib/provider-errors";

export function submitProviderLoginInput(loginSessionId: string, input: string) {
  return Effect.try({
    try: () => {
      const session = getLoginSessionState(loginSessionId);
      if (!session.waiter) throw new Error("Login session is not waiting for input.");

      const waiter = session.waiter;
      session.waiter = undefined;
      session.status = "authenticating";
      session.prompt = undefined;
      session.inputKind = undefined;
      session.placeholder = undefined;
      session.allowEmptyInput = undefined;
      waiter.resolve(input);
      return toLoginSession(session);
    },
    catch: (cause) => new ProviderLoginError({cause, message: errorMessage(cause, "Failed to submit provider login input.")}),
  });
}
