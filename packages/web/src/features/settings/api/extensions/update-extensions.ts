import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

export function useUpdateExtensions() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: () => unwrap(runtime.extensions.update(BACKGROUND_CONTEXT)),
  });
}
