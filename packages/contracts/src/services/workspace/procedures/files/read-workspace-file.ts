import {obj, type Static, str} from "@earendil-works/chord";

export const WorkspaceFileReadPayload = obj({
  path: str(),
  projectPath: str(),
});

export const WorkspaceFileReadResult = obj({
  content: str(),
});

export type WorkspaceFileReadPayload = Static<typeof WorkspaceFileReadPayload>;
export type WorkspaceFileReadResult = Static<typeof WorkspaceFileReadResult>;
