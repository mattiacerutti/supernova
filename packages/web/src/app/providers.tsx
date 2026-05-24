import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import ToastProvider from "@/components/ui/toast";
import SessionEventsProvider from "@/features/sessions/components/session-events-provider";
import AgentRpcClientProvider from "@/rpc/agent-rpc-client-provider";

interface AppProvidersProps {
  children: React.ReactNode;
}

export default function AppProviders(props: AppProvidersProps) {
  const {children} = props;
  const [queryClient] = useState(() => new QueryClient());

  return (
    <AgentRpcClientProvider>
      <QueryClientProvider client={queryClient}>
        <SessionEventsProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionEventsProvider>
      </QueryClientProvider>
    </AgentRpcClientProvider>
  );
}
