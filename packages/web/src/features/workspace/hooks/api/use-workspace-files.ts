import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

/** Keyed under `["workspace", projectPath]` so a finished agent turn can invalidate every workspace query of the project at once. */
export function useWorkspaceFiles(projectPath: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listWorkspaceFiles({projectPath})),
      queryKey: ["workspace", projectPath, "files"],
      // Git and filesystem failures are deterministic; retrying only delays the message.
      retry: false,
    })
  );
}
