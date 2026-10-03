import {useMutation, useQueryClient} from "@tanstack/react-query";
import {settingsKeys} from "@/features/settings/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

interface LogoutProviderInput {
  readonly providerId: string;
}

export function useLogoutProvider() {
  const runtime = useRuntime();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LogoutProviderInput) => unwrap(runtime.providers.logout(input)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: settingsKeys.providers()});
    },
  });
}
