import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import SessionStreamsProvider from "@/features/sessions/components/session-streams-provider";
import AgentRpcClientProvider from "@/rpc/agent-rpc-client-provider";

interface IAppProvidersProps {
  children: React.ReactNode;
}

export default function AppProviders(props: IAppProvidersProps) {
  const {children} = props;
  const [queryClient] = useState(() => new QueryClient());

  return (
    <AgentRpcClientProvider>
      <QueryClientProvider client={queryClient}>
        <SessionStreamsProvider>{children}</SessionStreamsProvider>
      </QueryClientProvider>
    </AgentRpcClientProvider>
  );
}
