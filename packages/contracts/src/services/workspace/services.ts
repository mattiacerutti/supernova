import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import {json, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";
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
 * state: new output reaches clients as string appends, and the capped scrollback drops from the front.
 */
export const WorkspaceService = remote("supernova.workspace", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      state: {
        terminals: json<TerminalsState>(),
      },
      methods: {
        /** Starts a shell, or returns the existing terminal with that id so a reopened tab reattaches. */
        openTerminal: method(json<TerminalOpenPayload>(), result<TerminalOpenResult, TerminalError>()),
        writeTerminal: method(json<TerminalWritePayload>(), result<null, TerminalNotFoundError>()),
        resizeTerminal: method(json<TerminalResizePayload>(), result<null, TerminalNotFoundError>()),
        /** Kills the shell; closing an unknown terminal is not an error. */
        closeTerminal: method(json<TerminalClosePayload>(), result<null>()),
        listTerminals: method(json<TerminalsListPayload>(), result<TerminalsListResult>()),
        listBranches: method(json<WorkspaceBranchesListPayload>(), result<WorkspaceBranchesListResult, WorkspaceGitError>()),
        getChanges: method(json<WorkspaceChangesGetPayload>(), result<WorkspaceChangesGetResult, WorkspaceGitError>()),
        getDiffContents: method(json<WorkspaceDiffContentsGetPayload>(), result<WorkspaceDiffContentsGetResult, WorkspaceFileError>()),
        listRepositories: method(json<WorkspaceRepositoriesListPayload>(), result<WorkspaceRepositoriesListResult>()),
        listFiles: method(json<WorkspaceFilesListPayload>(), result<WorkspaceFilesListResult, WorkspaceGitError>()),
        readFile: method(json<WorkspaceFileReadPayload>(), result<WorkspaceFileReadResult, WorkspaceFileError>()),
      },
    },
  },
});

export type WorkspaceService = MembersOf<typeof WorkspaceService>;
