import {mkdir} from "node:fs/promises";
import {Effect} from "effect";
import {FolderCreateError} from "@supernova/contracts/folders/procedures";
import {normalizePathForDisplay, resolveFolderPath} from "@supernova/agent-runtime/layers/folders/lib/folder-paths";

/** Creates a folder after resolving user-provided path input. */
export function createFolder(path: string) {
  return Effect.tryPromise({
    try: async () => {
      const resolvedPath = resolveFolderPath(path);
      await mkdir(resolvedPath, {recursive: true});
      return {path: normalizePathForDisplay(resolvedPath)};
    },
    catch: (cause) =>
      new FolderCreateError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to create folder.",
      }),
  });
}
