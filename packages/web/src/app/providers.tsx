import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import ToastProvider from "@/components/ui/toast";
import SessionEventsProvider from "@/features/sessions/components/session-events-provider";
import type {RpcClient} from "@/rpc/transport/protocol";
import RpcProvider from "@/rpc/provider";

interface AppProvidersProps {
  readonly children: React.ReactNode;
  readonly rpcClient: RpcClient;
}

export default function AppProviders(props: AppProvidersProps) {
  const {children, rpcClient} = props;
  const [queryClient] = useState(() => new QueryClient());

  return (
    <RpcProvider client={rpcClient}>
      <QueryClientProvider client={queryClient}>
        <SessionEventsProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionEventsProvider>
      </QueryClientProvider>
    </RpcProvider>
  );
}
