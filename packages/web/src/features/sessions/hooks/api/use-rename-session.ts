import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";
import {eq} from "@/rpc/effect-query";

interface RenameSessionInput {
  sessionId: string;
  title: string;
}

export function useRenameSession() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: RenameSessionInput) => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.renameSession(input)),
      onSuccess: async (session: Session) => {
        useSessionLiveStore.getState().hydrateSession(session);
        queryClient.setQueryData(sessionQueryKey(session.id), session);
        await queryClient.invalidateQueries({queryKey: listProjectSessionsQueryKey(session.projectPath)});
      },
    })
  );
}
