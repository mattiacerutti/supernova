import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Effect} from "effect";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {listProjectSessionsQueryKey} from "@/features/projects/hooks/api/use-list-project-sessions";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";
import {eq} from "@/rpc/effect-query";

interface RenameSessionInput {
  sessionId: string;
  title: string;
}

interface RenameSessionMutationContext {
  previousSession?: Session;
}

export function useRenameSession() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: RenameSessionInput) => Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc) => rpc.renameSession(input)),
      onMutate: (input): RenameSessionMutationContext => {
        const previousSession = queryClient.getQueryData<Session>(sessionQueryKey(input.sessionId));
        if (!previousSession) return {};

        const optimisticSession = {...previousSession, title: input.title};
        queryClient.setQueryData(sessionQueryKey(input.sessionId), optimisticSession);
        return {previousSession};
      },
      onError: (_error, _input, context) => {
        const previousSession = (context as RenameSessionMutationContext | undefined)?.previousSession;
        if (!previousSession) return;

        queryClient.setQueryData(sessionQueryKey(previousSession.id), previousSession);
      },
      onSuccess: async (session: Session) => {
        queryClient.setQueryData<Session>(sessionQueryKey(session.id), (current) => (current ? {...current, title: session.title, updatedAt: session.updatedAt} : session));
        await queryClient.invalidateQueries({queryKey: listProjectSessionsQueryKey(session.projectPath)});
      },
    })
  );
}
