import {Schema} from "effect";

export const WorkspaceBranchesListPayload = Schema.Struct({
  projectPath: Schema.String,
});

export const WorkspaceBranch = Schema.Struct({
  /** Branch name; remote-tracking branches keep their `origin/` prefix. */
  name: Schema.String,
  /** Whether the branch is a remote-tracking ref. */
  remote: Schema.Boolean,
  /** Path of the worktree that has this branch checked out, when one does. */
  worktreePath: Schema.optional(Schema.String),
});

export const WorkspaceBranchesListResult = Schema.Struct({
  /** Local branches by most recent commit, then remote-tracking branches. */
  branches: Schema.Array(WorkspaceBranch),
  /** Branch checked out in the project, or undefined on a detached HEAD. */
  current: Schema.optional(Schema.String),
});

export type WorkspaceBranch = typeof WorkspaceBranch.Type;
export type WorkspaceBranchesListPayload = typeof WorkspaceBranchesListPayload.Type;
export type WorkspaceBranchesListResult = typeof WorkspaceBranchesListResult.Type;
