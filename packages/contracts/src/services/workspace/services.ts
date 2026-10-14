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
  /** Every running or exited shell, keyed by terminal id; a closed one leaves. No output: that is each terminal's own. */
  readonly terminals: Readonly<Record<string, Terminal>>;
}

/**
 * A session's folder: its files, uncommitted Git changes, branches, and the shells running in it. The shells are
 * listed here without their output, which is the state of each terminal's `TerminalService`.
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
        /** Kills the shell; closing an unknown terminal is not an error. */
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

/**
 * One shell, addressed by its terminal id: a client holds it while a tab shows the terminal, and only subscribers of
 * `output` receive it. Holding an unknown or closed terminal fails. The input names the terminal, so payloads leave
 * out `id`. Every client shares one object per terminal; whoever resizes last sets the shell's size.
 */
export const TerminalService = remote("supernova.terminal", {
  version: 1,
  input: Type.Object({terminalId: Type.String()}),
  variants: {
    default: {
      state: {
        /** Capped output; new output is appended, the cap drops from the front. */
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
