import {useQueryClient} from "@tanstack/react-query";
import type {ReactNode} from "react";
import type {SessionEventContext} from "@/features/sessions/api/conversation/session-events";
import {connectSessionEvents} from "@/features/sessions/api/conversation/session-events";
import {workspaceKeys} from "@/features/workspace/api/query-keys";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {configurationKeys} from "@/api/configuration";
import {useRuntime} from "@/rpc/use-runtime";

/** Cross-feature reactions to session state. Session caches themselves are updated inside `connectSessionEvents`. */
function handleSessionEvent(context: SessionEventContext): void {
  const {entry, previous, queryClient, workspacePath} = context;

  // The agent may have touched the working tree during the turn.
  if (previous && previous.activity !== "idle" && entry.activity === "idle" && workspacePath) {
    void queryClient.invalidateQueries({queryKey: workspaceKeys.project(workspacePath)});
  }
}

interface SessionEventsProviderProps {
  readonly children: ReactNode;
}

export default function SessionEventsProvider(props: SessionEventsProviderProps) {
  const {children} = props;
  const queryClient = useQueryClient();
  const services = useRuntime();

  useMountEffect(() =>
    connectSessionEvents({
      onEvent: handleSessionEvent,
      onReconnect: () => void queryClient.invalidateQueries({queryKey: configurationKeys.all}),
      queryClient,
      services,
    })
  );

  return children;
}
