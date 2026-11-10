import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {settingsKeys} from "@/features/settings/api/query-keys";
import {useRuntime} from "@/runtime/hooks/use-runtime";

interface LogoutProviderInput {
  readonly providerId: string;
}

export function useLogoutProvider() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LogoutProviderInput) => runtime.providers.logout(input, context),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: settingsKeys.providers()});
    },
  });
}
