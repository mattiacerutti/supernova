import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import type {Session} from "@supernova/contracts/sessions/schemas";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {useRuntime} from "@/rpc/use-runtime";

interface ForkSessionInput {
  readonly sessionId: string;
  readonly turnId: string;
}

export function useForkSession() {
  const queryClient = useQueryClient();
  const services = useRuntime();

  return useMutation({
    mutationFn: async (input: ForkSessionInput): Promise<Session> => {
      const result = await services.management.fork(input, BACKGROUND_CONTEXT);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    },
    onSuccess: async (session) => {
      queryClient.setQueryData(sessionKeys.detail(session.id), session);
      await queryClient.invalidateQueries({queryKey: sessionKeys.list(session.projectPath)});
    },
  });
}
