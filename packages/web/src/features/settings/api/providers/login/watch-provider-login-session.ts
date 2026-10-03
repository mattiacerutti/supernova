import type {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import {useRuntime} from "@/rpc/use-runtime";

type Unsubscribe = () => void;

/**
 * Returns a subscriber for one login's steps: the providers' replicated state delivers its current step at once and
 * every later one. Call the returned function from a mount effect.
 */
export function useWatchProviderLoginSession(): (loginSessionId: string, onSession: (session: ProviderLoginSession) => void) => Unsubscribe {
  const runtime = useRuntime();

  return (loginSessionId, onSession) => {
    let last: ProviderLoginSession | undefined;
    return runtime.providers.logins.subscribe((state) => {
      const session = state.logins[loginSessionId];
      if (!session || session === last) return;
      last = session;
      onSession(session);
    });
  };
}
