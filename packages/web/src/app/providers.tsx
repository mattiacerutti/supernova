import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import ToastProvider from "@/components/ui/toast";
import SessionEventsProvider from "@/app/session-events-provider";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";
import RuntimeProvider from "@/rpc/provider";

interface AppProvidersProps {
  readonly children: React.ReactNode;
  readonly runtime: RuntimeClient;
}

export default function AppProviders(props: AppProvidersProps) {
  const {children, runtime} = props;
  const [queryClient] = useState(() => new QueryClient());

  return (
    <RuntimeProvider runtime={runtime}>
      <QueryClientProvider client={queryClient}>
        <SessionEventsProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionEventsProvider>
      </QueryClientProvider>
    </RuntimeProvider>
  );
}
