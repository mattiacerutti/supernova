import {useMutation} from "@tanstack/react-query";
import {unwrap} from "@/runtime/runtime-result";
import {useRuntime} from "@/runtime/use-runtime";

export function useUpdateExtensions() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: () => unwrap(runtime.extensions.update(null)),
  });
}
