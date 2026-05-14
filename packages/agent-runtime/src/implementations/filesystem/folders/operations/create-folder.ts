import {mkdir} from "node:fs/promises";
import {Effect} from "effect";
import {FolderCreateError} from "@pi-desktop/contracts/folders/procedures";
import {resolveFolderPath} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/lib/folder-paths";

export function createFolder(path: string) {
  return Effect.tryPromise({
    try: async () => {
      const resolvedPath = resolveFolderPath(path);
      await mkdir(resolvedPath, {recursive: true});
      return {path: resolvedPath};
    },
    catch: (cause) =>
      new FolderCreateError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to create folder.",
      }),
  });
}
