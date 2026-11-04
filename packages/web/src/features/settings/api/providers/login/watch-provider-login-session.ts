import type {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import {follow} from "@/runtime/transport/follow";
import {useRuntime} from "@/runtime/use-runtime";

type Unsubscribe = () => void;

export function useWatchProviderLoginSession(): (loginSessionId: string, onSession: (session: ProviderLoginSession) => void) => Unsubscribe {
  const runtime = useRuntime();

  return (loginSessionId, onSession) => {
    let last: string | undefined;
    return follow(runtime.providers.logins, (state) => {
      const session = state.logins[loginSessionId];
      // Each change replaces one login's value; the others arrive equal, not the same objects.
      if (!session || JSON.stringify(session) === last) return;
      last = JSON.stringify(session);
      onSession(session);
    });
  };
}
