import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import ToastProvider from "@/components/ui/toast";
import SessionEventsProvider from "@/app/session-events-provider";
import type {RpcClient} from "@/rpc/transport/protocol";
import type {SessionServicesClient} from "@/rpc/transport/session-services";
import RpcProvider from "@/rpc/provider";

interface AppProvidersProps {
  readonly children: React.ReactNode;
  readonly rpcClient: RpcClient;
  readonly sessionServices: SessionServicesClient;
}

export default function AppProviders(props: AppProvidersProps) {
  const {children, rpcClient, sessionServices} = props;
  const [queryClient] = useState(() => new QueryClient());

  return (
    <RpcProvider client={rpcClient} sessionServices={sessionServices}>
      <QueryClientProvider client={queryClient}>
        <SessionEventsProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionEventsProvider>
      </QueryClientProvider>
    </RpcProvider>
  );
}
