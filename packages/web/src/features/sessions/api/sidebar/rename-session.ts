import {useMutation, useQueryClient} from "@tanstack/react-query";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useRuntime} from "@/rpc/use-runtime";

interface RenameSessionInput {
  readonly sessionId: string;
  readonly title: string;
}

interface RenameSessionContext {
  readonly previousSession?: Session;
}

export function useRenameSession() {
  const queryClient = useQueryClient();
  const services = useRuntime();

  return useMutation({
    mutationFn: async (input: RenameSessionInput): Promise<Session> => {
      const result = await services.management.rename(input);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    onMutate: (input): RenameSessionContext => {
      const previousSession = queryClient.getQueryData<Session>(sessionKeys.detail(input.sessionId));
      if (!previousSession) return {};

      queryClient.setQueryData(sessionKeys.detail(input.sessionId), {...previousSession, title: input.title});
      return {previousSession};
    },
    onError: (_error, _input, context) => {
      const previousSession = context?.previousSession;
      if (!previousSession) return;

      queryClient.setQueryData(sessionKeys.detail(previousSession.id), previousSession);
    },
    onSuccess: async (session) => {
      queryClient.setQueryData<Session>(sessionKeys.detail(session.id), (current) => (current ? {...current, title: session.title, updatedAt: session.updatedAt} : session));
      await queryClient.invalidateQueries({queryKey: sessionKeys.list(session.projectPath)});
    },
  });
}
