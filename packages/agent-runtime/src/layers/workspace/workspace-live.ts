import {Layer} from "effect";
import {getWorkspaceChanges} from "@supernova/agent-runtime/layers/workspace/operations/changes/get-workspace-changes";
import {getWorkspaceDiffContents} from "@supernova/agent-runtime/layers/workspace/operations/changes/get-workspace-diff-contents";
import {listWorkspaceFiles} from "@supernova/agent-runtime/layers/workspace/operations/files/list-workspace-files";
import {readWorkspaceFile} from "@supernova/agent-runtime/layers/workspace/operations/files/read-workspace-file";
import {WorkspaceService} from "@supernova/agent-runtime/services/workspace-service";

export const WorkspaceLive = Layer.succeed(WorkspaceService, {
  getChanges: getWorkspaceChanges,
  getDiffContents: getWorkspaceDiffContents,
  listFiles: listWorkspaceFiles,
  readFile: readWorkspaceFile,
});
