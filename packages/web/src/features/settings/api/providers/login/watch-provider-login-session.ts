import type {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import {follow} from "@/runtime/references";
import {useRuntime} from "@/runtime/hooks/use-runtime";

type Unsubscribe = () => void;

export function useWatchProviderLoginSession(): (loginSessionId: string, onSession: (session: ProviderLoginSession) => void) => Unsubscribe {
  const runtime = useRuntime();

  return (loginSessionId, onSession) => {
    let last: string | undefined;
    return follow(runtime.providers.logins, (state) => {
      const session = state.logins[loginSessionId];
      // The other logins arrive equal, not the same objects.
      if (!session || JSON.stringify(session) === last) return;
      last = JSON.stringify(session);
      onSession(session);
    });
  };
}
