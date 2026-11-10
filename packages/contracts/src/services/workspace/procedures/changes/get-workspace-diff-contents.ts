import {obj, type Static, str} from "@earendil-works/chord";

export const WorkspaceDiffContentsGetPayload = obj({
  path: str(),
  projectPath: str(),
  repositoryRoot: str(),
});

export const WorkspaceDiffContentsGetResult = obj({
  newContents: str(),
  oldContents: str(),
});

export type WorkspaceDiffContentsGetPayload = Static<typeof WorkspaceDiffContentsGetPayload>;
export type WorkspaceDiffContentsGetResult = Static<typeof WorkspaceDiffContentsGetResult>;
