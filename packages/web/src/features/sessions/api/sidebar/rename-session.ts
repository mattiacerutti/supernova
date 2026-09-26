import {useMutation, useQueryClient} from "@tanstack/react-query";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {Effect} from "effect";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

interface RenameSessionInput {
  readonly sessionId: string;
  readonly title: string;
}

interface RenameSessionContext {
  readonly previousSession?: Session;
}

export function useRenameSession() {
  const queryClient = useQueryClient();

  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: RenameSessionInput) => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.renameSession(input)),
      onMutate: (input): RenameSessionContext => {
        const previousSession = queryClient.getQueryData<Session>(sessionKeys.detail(input.sessionId));
        if (!previousSession) return {};

        queryClient.setQueryData(sessionKeys.detail(input.sessionId), {...previousSession, title: input.title});
        return {previousSession};
      },
      onError: (_error, _input, context) => {
        const previousSession = (context as RenameSessionContext | undefined)?.previousSession;
        if (!previousSession) return;

        queryClient.setQueryData(sessionKeys.detail(previousSession.id), previousSession);
      },
      onSuccess: async (session: Session) => {
        queryClient.setQueryData<Session>(sessionKeys.detail(session.id), (current) => (current ? {...current, title: session.title, updatedAt: session.updatedAt} : session));
        await queryClient.invalidateQueries({queryKey: sessionKeys.list(session.projectPath)});
      },
    })
  );
}
