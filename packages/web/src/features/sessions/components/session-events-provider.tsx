import {useQueryClient} from "@tanstack/react-query";
import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import {useMountEffect} from "@/lib/use-mount-effect";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface SessionEventsProviderProps {
  children: React.ReactNode;
}

export default function SessionEventsProvider(props: SessionEventsProviderProps) {
  const {children} = props;
  const queryClient = useQueryClient();
  const rpcClient = useAgentRpcClient();
  const connectEvents = useSessionStreamStore((state) => state.connectEvents);
  const disconnectEvents = useSessionStreamStore((state) => state.disconnectEvents);

  useMountEffect(() => {
    connectEvents({queryClient, rpcClient});
    return () => {
      disconnectEvents();
    };
  });

  return children;
}
