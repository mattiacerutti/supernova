import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import ToastProvider from "@/components/ui/toast";
import SessionEventsProvider from "@/features/sessions/components/session-events-provider";
import type {AgentRpcClientApi} from "@/rpc/agent-rpc-client";
import AgentRpcClientProvider from "@/rpc/agent-rpc-client-provider";

interface AppProvidersProps {
  readonly children: React.ReactNode;
  readonly rpcClient: AgentRpcClientApi;
}

export default function AppProviders(props: AppProvidersProps) {
  const {children, rpcClient} = props;
  const [queryClient] = useState(() => new QueryClient());

  return (
    <AgentRpcClientProvider client={rpcClient}>
      <QueryClientProvider client={queryClient}>
        <SessionEventsProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionEventsProvider>
      </QueryClientProvider>
    </AgentRpcClientProvider>
  );
}
