import {Context, Effect} from "effect";
import type {
  WorkspaceChangesGetResult,
  WorkspaceDiffContentsGetPayload,
  WorkspaceDiffContentsGetResult,
  WorkspaceFileReadPayload,
  WorkspaceFileReadResult,
  WorkspaceFilesListResult,
} from "@supernova/contracts/workspace/procedures";
import type {WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";

export interface WorkspaceServiceShape {
  readonly getChanges: (projectPath: string) => Effect.Effect<WorkspaceChangesGetResult, WorkspaceGitError>;
  readonly getDiffContents: (input: WorkspaceDiffContentsGetPayload) => Effect.Effect<WorkspaceDiffContentsGetResult, WorkspaceFileError>;
  readonly listFiles: (projectPath: string) => Effect.Effect<WorkspaceFilesListResult, WorkspaceGitError>;
  readonly readFile: (input: WorkspaceFileReadPayload) => Effect.Effect<WorkspaceFileReadResult, WorkspaceFileError>;
}

export class WorkspaceService extends Context.Service<WorkspaceService, WorkspaceServiceShape>()("supernova/agent-runtime/WorkspaceService") {}
