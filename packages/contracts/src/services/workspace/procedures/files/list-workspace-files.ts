import {arr, obj, type Static, str} from "@earendil-works/chord";

export const WorkspaceFilesListPayload = obj({
  projectPath: str(),
});

export const WorkspaceFilesListResult = obj({
  files: arr(str()),
});

export type WorkspaceFilesListPayload = Static<typeof WorkspaceFilesListPayload>;
export type WorkspaceFilesListResult = Static<typeof WorkspaceFilesListResult>;
