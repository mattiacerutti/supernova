import {useQueryClient} from "@tanstack/react-query";
import type {ReactNode} from "react";
import type {SessionEventContext} from "@/features/sessions/api/conversation/session-events";
import {connectSessionEvents} from "@/features/sessions/api/conversation/session-events";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {configurationKeys} from "@/api/configuration";
import {useRpcClient} from "@/rpc/use-rpc-client";

/** Cross-feature reactions to the session stream. Session caches themselves are updated inside `connectSessionEvents`. */
function handleSessionEvent(context: SessionEventContext): void {
  const {event, queryClient, workspacePath} = context;

  if (event.type === "connected") {
    void queryClient.invalidateQueries({queryKey: configurationKeys.all});
    return;
  }

  // The agent may have touched the working tree during the turn.
  if (event.type === "session.agent.ended" && workspacePath) {
    void queryClient.invalidateQueries({queryKey: workspaceKeys.project(workspacePath)});
  }
}

interface SessionEventsProviderProps {
  readonly children: ReactNode;
}

export default function SessionEventsProvider(props: SessionEventsProviderProps) {
  const {children} = props;
  const queryClient = useQueryClient();
  const rpcClient = useRpcClient();

  useMountEffect(() => connectSessionEvents({onEvent: handleSessionEvent, queryClient, rpcClient}));

  return children;
}
