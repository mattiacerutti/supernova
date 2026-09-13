import {readFile, realpath} from "node:fs/promises";
import {resolve, sep} from "node:path";
import {Effect} from "effect";
import type {WorkspaceFileReadPayload} from "@supernova/contracts/workspace/procedures";
import {WorkspaceFileNotFoundError, WorkspaceGenericError} from "@supernova/contracts/workspace/schemas";
import {decodeWorkspaceFile, isWorkspaceError} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";

/** Reads a project file as UTF-8, refusing paths that escape the project. */
export function readWorkspaceFile(input: WorkspaceFileReadPayload) {
  return Effect.tryPromise({
    try: async () => {
      const root = await realpath(input.projectPath);
      const target = await realpath(resolve(root, input.path)).catch(() => undefined);
      if (!target || (target !== root && !target.startsWith(root + sep))) throw new WorkspaceFileNotFoundError({message: "File not found."});
      return {content: decodeWorkspaceFile(await readFile(target))};
    },
    catch: (cause) => (isWorkspaceError(cause) ? cause : new WorkspaceGenericError({cause, message: "Failed to read file."})),
  });
}
