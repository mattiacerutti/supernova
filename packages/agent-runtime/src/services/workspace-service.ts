import {Context, Effect} from "effect";
import type {
  WorkspaceChangesGetPayload,
  WorkspaceChangesGetResult,
  WorkspaceDiffContentsGetPayload,
  WorkspaceDiffContentsGetResult,
  WorkspaceFileReadPayload,
  WorkspaceFileReadResult,
  WorkspaceFilesListResult,
  WorkspaceRepositoriesListResult,
} from "@supernova/contracts/workspace/procedures";
import type {WorkspaceFileError, WorkspaceGenericError, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";

export interface WorkspaceServiceShape {
  readonly getChanges: (input: WorkspaceChangesGetPayload) => Effect.Effect<WorkspaceChangesGetResult, WorkspaceGitError>;
  readonly getDiffContents: (input: WorkspaceDiffContentsGetPayload) => Effect.Effect<WorkspaceDiffContentsGetResult, WorkspaceFileError>;
  readonly listFiles: (projectPath: string) => Effect.Effect<WorkspaceFilesListResult, WorkspaceGitError>;
  readonly listRepositories: (projectPath: string) => Effect.Effect<WorkspaceRepositoriesListResult, WorkspaceGenericError>;
  readonly readFile: (input: WorkspaceFileReadPayload) => Effect.Effect<WorkspaceFileReadResult, WorkspaceFileError>;
}

export class WorkspaceService extends Context.Service<WorkspaceService, WorkspaceServiceShape>()("supernova/agent-runtime/WorkspaceService") {}
