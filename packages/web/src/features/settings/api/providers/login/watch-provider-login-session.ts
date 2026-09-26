import type {ProviderLoginSession} from "@supernova/contracts/providers/schemas";
import {Effect, Stream} from "effect";
import {useRpcClient} from "@/rpc/use-rpc-client";

type Unsubscribe = () => void;

/** Returns a subscriber for one login session's step stream. Call the returned function from a mount effect. */
export function useWatchProviderLoginSession(): (loginSessionId: string, onSession: (session: ProviderLoginSession) => void) => Unsubscribe {
  const rpcClient = useRpcClient();

  return (loginSessionId, onSession) => {
    let disposed = false;
    let interrupt: (() => Promise<void>) | undefined;

    void rpcClient
      .fork((rpc) => rpc.watchProviderLoginSession({loginSessionId}).pipe(Stream.runForEach((session) => Effect.sync(() => !disposed && onSession(session)))))
      .then((fiber) => {
        if (disposed) {
          void fiber.interrupt();
          return;
        }
        interrupt = fiber.interrupt;
      });

    return () => {
      disposed = true;
      void interrupt?.();
    };
  };
}
