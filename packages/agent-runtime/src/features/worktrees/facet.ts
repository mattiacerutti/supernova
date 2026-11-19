import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {RuntimeConfig} from "@supernova/agent-runtime/core/contract";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/contract";
import {createWorktree, removeWorktree} from "@supernova/agent-runtime/features/worktrees/worktrees";

export const worktreesFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  host.serve(Worktrees, (_params, self) => {
    const config = self.get(RuntimeConfig, {});

    return {
      create: (input) => createWorktree({...input, storageRoot: config.paths.value.worktreesRoot}),
      remove: async (input) => {
        await removeWorktree(input);
        return null;
      },
    };
  });
});
