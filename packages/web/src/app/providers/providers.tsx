import {PluginError} from "@earendil-works/chord";
import {MutationCache, QueryCache, QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import {TooltipProvider} from "@/components/ui/tooltip";
import {syncSessions} from "@/features/sessions/api/sessions-sync";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {useMountEffect} from "@/hooks/use-mount-effect";
import type {RuntimeClient} from "@/runtime/client";
import RuntimeProvider from "@/runtime/provider";

interface AppProvidersProps {
  readonly children: React.ReactNode;
  readonly runtime: RuntimeClient;
}

function connectApp(runtime: RuntimeClient, queryClient: QueryClient): () => void {
  const stopSessions = syncSessions(runtime);
  let disconnected = false;
  const stopConnection = runtime.onConnectionChange((state) => {
    if (state !== "connected") disconnected = true;
    if (state !== "connected" || !disconnected) return;
    disconnected = false;
    void queryClient.invalidateQueries();
  });
  const stopRunsEnding = useSessionsStore.subscribe((state, previous) => {
    const runEnded = Object.entries(previous.statuses).some(([sessionId, entry]) => entry.activity !== "idle" && (state.statuses[sessionId]?.activity ?? "idle") === "idle");
    if (runEnded) void queryClient.invalidateQueries({queryKey: workspaceKeys.all});
  });
  return () => {
    stopSessions();
    stopConnection();
    stopRunsEnding();
  };
}

export default function AppProviders(props: AppProvidersProps) {
  const {children, runtime} = props;
  const [queryClient] = useState(() => {
    const log = (error: Error) => console.error(`[runtime] ${error instanceof PluginError ? error.code : error.name}: ${error.message}`);
    return new QueryClient({queryCache: new QueryCache({onError: log}), mutationCache: new MutationCache({onError: log})});
  });

  useMountEffect(() => connectApp(runtime, queryClient));

  return (
    <RuntimeProvider runtime={runtime}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </RuntimeProvider>
  );
}
