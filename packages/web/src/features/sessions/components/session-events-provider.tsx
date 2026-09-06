import {useQueryClient} from "@tanstack/react-query";
import {connectSessionEvents} from "@/features/sessions/lib/streaming/session-event-stream";
import {useMountEffect} from "@/lib/use-mount-effect";
import {useRpcClient} from "@/rpc/use-rpc-client";

interface SessionEventsProviderProps {
  children: React.ReactNode;
}

export default function SessionEventsProvider(props: SessionEventsProviderProps) {
  const {children} = props;
  const queryClient = useQueryClient();
  const rpcClient = useRpcClient();

  useMountEffect(() => connectSessionEvents({queryClient, rpcClient}));

  return children;
}
