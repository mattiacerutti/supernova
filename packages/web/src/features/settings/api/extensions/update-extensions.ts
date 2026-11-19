import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useMutation} from "@tanstack/react-query";
import {useRuntime} from "@/runtime/hooks/use-runtime";

export function useUpdateExtensions() {
  const runtime = useRuntime();
  return useMutation({
    mutationFn: () => runtime.extensions.update(context),
  });
}
