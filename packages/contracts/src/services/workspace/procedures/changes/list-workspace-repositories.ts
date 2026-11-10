import {arr, obj, type Static, str} from "@earendil-works/chord";

export const WorkspaceRepositoriesListPayload = obj({
  projectPath: str(),
});

/** `"."` is the project. */
export const WorkspaceRepositoriesListResult = obj({
  repositories: arr(str()),
});

export type WorkspaceRepositoriesListPayload = Static<typeof WorkspaceRepositoriesListPayload>;
export type WorkspaceRepositoriesListResult = Static<typeof WorkspaceRepositoriesListResult>;
