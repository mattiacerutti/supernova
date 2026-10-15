import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import {Type} from "typebox";
import {json, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";
import type {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalOpenResult,
  TerminalResizePayload,
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
import type {Terminal, TerminalError, TerminalNotFoundError, TerminalOutput, WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/services/workspace/schemas";

export interface TerminalsState {
  readonly terminals: Readonly<Record<string, Terminal>>;
}

export const WorkspaceService = remote("supernova.workspace", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      state: {
        terminals: json<TerminalsState>(),
      },
      methods: {
        openTerminal: method(json<TerminalOpenPayload>(), result<TerminalOpenResult, TerminalError>()),
        closeTerminal: method(json<TerminalClosePayload>(), result<null>()),
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

/** Held while a tab shows it; only subscribers receive output. Whoever resizes last sets the shell's size. */
export const TerminalService = remote("supernova.terminal", {
  version: 1,
  input: Type.Object({terminalId: Type.String()}),
  variants: {
    default: {
      state: {
        output: json<TerminalOutput>(),
      },
      methods: {
        /** Sends input to the shell; dropped once it has exited. Fails once the terminal is closed. */
        write: method(json<Omit<TerminalWritePayload, "id">>(), result<null, TerminalNotFoundError>()),
        resize: method(json<Omit<TerminalResizePayload, "id">>(), result<null, TerminalNotFoundError>()),
      },
    },
  },
});

export type TerminalService = MembersOf<typeof TerminalService>;
