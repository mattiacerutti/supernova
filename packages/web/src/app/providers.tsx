import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import ToastProvider from "@/components/ui/toast";
import SessionStreamsProvider from "@/features/sessions/components/session-streams-provider";
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
        <SessionStreamsProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionStreamsProvider>
      </QueryClientProvider>
    </AgentRpcClientProvider>
  );
}
