import {arr, obj, type Static, str} from "@earendil-works/chord";
import {WorkspaceChangeEntry} from "@supernova/contracts/services/workspace/schemas";

export const WorkspaceChangesGetPayload = obj({
  projectPath: str(),
  repositoryRoot: str(),
});

export const WorkspaceChangesGetResult = obj({
  uncommitted: arr(WorkspaceChangeEntry),
});

export type WorkspaceChangesGetPayload = Static<typeof WorkspaceChangesGetPayload>;
export type WorkspaceChangesGetResult = Static<typeof WorkspaceChangesGetResult>;
