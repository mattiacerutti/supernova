import {useQueryClient} from "@tanstack/react-query";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {useMountEffect} from "@/lib/use-mount-effect";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface SessionEventsProviderProps {
  children: React.ReactNode;
}

export default function SessionEventsProvider(props: SessionEventsProviderProps) {
  const {children} = props;
  const queryClient = useQueryClient();
  const rpcClient = useAgentRpcClient();
  const connect = useSessionLiveStore((state) => state.connect);
  const disconnect = useSessionLiveStore((state) => state.disconnect);

  useMountEffect(() => {
    connect({queryClient, rpcClient});
    return () => {
      disconnect();
    };
  });

  return children;
}
