import {readFile} from "node:fs/promises";
import {Effect} from "effect";
import type {WorkspaceFileReadPayload} from "@supernova/contracts/workspace/procedures";
import {WorkspaceFileNotFoundError, WorkspaceGenericError} from "@supernova/contracts/workspace/schemas";
import {decodeWorkspaceFile, isWorkspaceError} from "@supernova/agent-runtime/layers/workspace/lib/workspace-git";
import {pathInProject} from "@supernova/agent-runtime/layers/workspace/lib/workspace-paths";

/** Reads a project file as UTF-8, refusing paths that escape the project. */
export function readWorkspaceFile(input: WorkspaceFileReadPayload) {
  return Effect.tryPromise({
    try: async () => {
      const target = await pathInProject(input.projectPath, input.path);
      if (!target) throw new WorkspaceFileNotFoundError({message: "File not found."});
      return {content: decodeWorkspaceFile(await readFile(target))};
    },
    catch: (cause) => (isWorkspaceError(cause) ? cause : new WorkspaceGenericError({cause, message: "Failed to read file."})),
  });
}
