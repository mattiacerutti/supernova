import {lit, obj, type Static, str, union} from "@earendil-works/chord";

export const SessionWorktree = obj({
  branch: str(),
  path: str(),
});

export const SessionWorkspaceSelection = union([obj({mode: lit("local")}), obj({mode: lit("worktree"), baseRef: str()})]);

export type SessionWorktree = Static<typeof SessionWorktree>;
export type SessionWorkspaceSelection = Static<typeof SessionWorkspaceSelection>;
