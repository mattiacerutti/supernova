import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

/** Git failures are deterministic; retrying only delays the message. */
const NO_RETRY = {retry: false} as const;

/** Prefix for every workspace query of a project, so a finished agent turn can refresh them all at once. */
export function workspaceQueryKey(projectPath: string) {
  return ["workspace", projectPath] as const;
}

export function useWorkspaceFiles(projectPath: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listWorkspaceFiles({projectPath})),
      queryKey: [...workspaceQueryKey(projectPath), "files"],
      ...NO_RETRY,
    })
  );
}

export function useWorkspaceChanges(projectPath: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.getWorkspaceChanges({projectPath})),
      queryKey: [...workspaceQueryKey(projectPath), "changes"],
      ...NO_RETRY,
    })
  );
}

export function useWorkspaceDiffContents(projectPath: string, path: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.getWorkspaceDiffContents({path, projectPath})),
      queryKey: [...workspaceQueryKey(projectPath), "diff", path],
      ...NO_RETRY,
    })
  );
}

export function useWorkspaceFile(projectPath: string, path: string) {
  return useQuery(
    eq.queryOptions({
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.readWorkspaceFile({path, projectPath})),
      queryKey: [...workspaceQueryKey(projectPath), "file", path],
      ...NO_RETRY,
    })
  );
}
