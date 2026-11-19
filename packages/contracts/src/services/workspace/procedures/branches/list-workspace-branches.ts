import {arr, bool, obj, opt, type Static, str} from "@earendil-works/chord";

export const WorkspaceBranchesListPayload = obj({
  projectPath: str(),
});

export const WorkspaceBranch = obj({
  name: str(),
  remote: bool(),
  worktreePath: opt(str()),
});

export const WorkspaceBranchesListResult = obj({
  branches: arr(WorkspaceBranch),
  current: opt(str()),
});

export type WorkspaceBranch = Static<typeof WorkspaceBranch>;
export type WorkspaceBranchesListPayload = Static<typeof WorkspaceBranchesListPayload>;
export type WorkspaceBranchesListResult = Static<typeof WorkspaceBranchesListResult>;
