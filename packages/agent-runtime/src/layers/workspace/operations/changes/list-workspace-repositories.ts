import {Effect} from "effect";
import {discoverWorkspaceRepositories} from "@supernova/agent-runtime/layers/workspace/lib/workspace-repositories";

export function listWorkspaceRepositories(projectPath: string) {
  return Effect.map(discoverWorkspaceRepositories(projectPath), (repositories) => ({repositories}));
}
