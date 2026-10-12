import type {Context, ReplicatedState} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import type {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalOpenResult,
  TerminalResizePayload,
  TerminalsListPayload,
  TerminalsListResult,
  TerminalWritePayload,
  WorkspaceBranchesListPayload,
  WorkspaceBranchesListResult,
  WorkspaceChangesGetPayload,
  WorkspaceChangesGetResult,
  WorkspaceDiffContentsGetPayload,
  WorkspaceDiffContentsGetResult,
  WorkspaceFileReadPayload,
  WorkspaceFileReadResult,
  WorkspaceFilesListPayload,
  WorkspaceFilesListResult,
  WorkspaceRepositoriesListPayload,
  WorkspaceRepositoriesListResult,
} from "@supernova/contracts/services/workspace/procedures";
import type {TerminalError, TerminalNotFoundError, TerminalOutput, WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/services/workspace/schemas";

export interface TerminalsState {
  /** Every running or exited shell, keyed by terminal id; a closed one leaves. */
  readonly terminals: Readonly<Record<string, TerminalOutput>>;
}

/**
 * A session's folder: its files, uncommitted Git changes, branches, and the shells running in it. Terminal output is
 * replicated state: new output reaches clients as string appends, and the capped scrollback drops from the front.
 */
export interface WorkspaceService {
  readonly terminals: ReplicatedState<TerminalsState>;
  /** Starts a shell, or returns the existing terminal with that id so a reopened tab reattaches. */
  openTerminal(payload: TerminalOpenPayload, context: Context): Promise<ServiceResult<TerminalOpenResult, TerminalError>>;
  writeTerminal(payload: TerminalWritePayload, context: Context): Promise<ServiceResult<null, TerminalNotFoundError>>;
  resizeTerminal(payload: TerminalResizePayload, context: Context): Promise<ServiceResult<null, TerminalNotFoundError>>;
  /** Kills the shell; closing an unknown terminal is not an error. */
  closeTerminal(payload: TerminalClosePayload, context: Context): Promise<ServiceResult<null>>;
  listTerminals(payload: TerminalsListPayload, context: Context): Promise<ServiceResult<TerminalsListResult>>;
  listBranches(payload: WorkspaceBranchesListPayload, context: Context): Promise<ServiceResult<WorkspaceBranchesListResult, WorkspaceGitError>>;
  getChanges(payload: WorkspaceChangesGetPayload, context: Context): Promise<ServiceResult<WorkspaceChangesGetResult, WorkspaceGitError>>;
  getDiffContents(payload: WorkspaceDiffContentsGetPayload, context: Context): Promise<ServiceResult<WorkspaceDiffContentsGetResult, WorkspaceFileError>>;
  listRepositories(payload: WorkspaceRepositoriesListPayload, context: Context): Promise<ServiceResult<WorkspaceRepositoriesListResult>>;
  listFiles(payload: WorkspaceFilesListPayload, context: Context): Promise<ServiceResult<WorkspaceFilesListResult, WorkspaceGitError>>;
  readFile(payload: WorkspaceFileReadPayload, context: Context): Promise<ServiceResult<WorkspaceFileReadResult, WorkspaceFileError>>;
}

export const WorkspaceService = defineService<WorkspaceService>("supernova.workspace");
