import {Schema} from "effect";

/** A Git worktree a session runs in, separate from the project's own checkout. */
export const SessionWorktree = Schema.Struct({
  /** Branch checked out in the worktree. */
  branch: Schema.String,
  /** Absolute path of the worktree on the server. */
  path: Schema.String,
});

/** Where a new session runs: the project's checkout, or a fresh worktree branched off `baseRef`. */
export const SessionWorkspaceSelection = Schema.Union([Schema.Struct({mode: Schema.Literal("local")}), Schema.Struct({mode: Schema.Literal("worktree"), baseRef: Schema.String})]);

export type SessionWorktree = typeof SessionWorktree.Type;
export type SessionWorkspaceSelection = typeof SessionWorkspaceSelection.Type;
