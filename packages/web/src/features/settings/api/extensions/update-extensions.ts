import {useMutation} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

export function useUpdateExtensions() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.updateExtensions()),
    })
  );
}
