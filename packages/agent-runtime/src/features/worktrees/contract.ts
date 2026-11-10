import {local, method, nul} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";

export const Worktrees = local("supernova.worktrees", {
  version: 1,
  params: {},
  members: {
    create: method(json<{readonly baseRef: string; readonly projectPath: string}>(), json<SessionWorktree>()),
    remove: method(json<{readonly projectPath: string; readonly worktree: SessionWorktree}>(), nul()),
  },
});
