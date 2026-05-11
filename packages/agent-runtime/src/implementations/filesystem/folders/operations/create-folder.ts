import {mkdir} from "node:fs/promises";
import {Effect} from "effect";
import {AgentFolderCreateError} from "@pi-desktop/contracts/folders";
import {resolveFolderPath} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/lib/folder-paths";

export function createFolder(path: string) {
  return Effect.tryPromise({
    try: async () => {
      const resolvedPath = resolveFolderPath(path);
      await mkdir(resolvedPath, {recursive: true});
      return {path: resolvedPath};
    },
    catch: (cause) =>
      new AgentFolderCreateError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to create folder.",
      }),
  });
}
