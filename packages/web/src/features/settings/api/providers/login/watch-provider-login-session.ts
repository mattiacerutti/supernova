import type {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import {useRuntime} from "@/runtime/use-runtime";

type Unsubscribe = () => void;

export function useWatchProviderLoginSession(): (loginSessionId: string, onSession: (session: ProviderLoginSession) => void) => Unsubscribe {
  const runtime = useRuntime();

  return (loginSessionId, onSession) => {
    let last: ProviderLoginSession | undefined;
    return runtime.providers.logins.subscribe((state) => {
      const session = state?.logins[loginSessionId];
      if (!session || session === last) return;
      last = session;
      onSession(session);
    });
  };
}
