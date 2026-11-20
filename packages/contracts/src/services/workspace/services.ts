import type {Reference} from "@earendil-works/chord";
import {method, nul, remote, str} from "@earendil-works/chord";
import type {Errors} from "@supernova/contracts/lib/errors";
import {json, serverHost} from "@supernova/contracts/lib/protocol";
import type {
  TerminalChannelResult,
  TerminalOpenResult,
  WorkspaceBranchesListResult,
  WorkspaceChangesGetResult,
  WorkspaceDiffContentsGetResult,
  WorkspaceFileReadResult,
  WorkspaceFilesListResult,
  WorkspaceRepositoriesListResult,
} from "@supernova/contracts/services/workspace/procedures";
import {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalResizePayload,
  TerminalThemePayload,
  WorkspaceBranchesListPayload,
  WorkspaceChangesGetPayload,
  WorkspaceDiffContentsGetPayload,
  WorkspaceFileReadPayload,
  WorkspaceFilesListPayload,
  WorkspaceRepositoriesListPayload,
} from "@supernova/contracts/services/workspace/procedures";
import type {Terminal} from "@supernova/contracts/services/workspace/schemas";
import {TerminalError, TerminalNotFoundError, WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/services/workspace/schemas";

export interface TerminalsState {
  readonly terminals: Readonly<Record<string, Terminal>>;
}

export const WorkspaceService = remote("supernova.workspace", {
  version: 3,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      state: {
        terminals: json<TerminalsState>(),
      },
      methods: {
        openTerminal: method(TerminalOpenPayload, json<TerminalOpenResult>()),
        closeTerminal: method(TerminalClosePayload, nul()),
        listBranches: method(WorkspaceBranchesListPayload, json<WorkspaceBranchesListResult>()),
        getChanges: method(WorkspaceChangesGetPayload, json<WorkspaceChangesGetResult>()),
        getDiffContents: method(WorkspaceDiffContentsGetPayload, json<WorkspaceDiffContentsGetResult>()),
        listRepositories: method(WorkspaceRepositoriesListPayload, json<WorkspaceRepositoriesListResult>()),
        listFiles: method(WorkspaceFilesListPayload, json<WorkspaceFilesListResult>()),
        readFile: method(WorkspaceFileReadPayload, json<WorkspaceFileReadResult>()),
      },
    },
  },
});

export const WorkspaceErrors = {
  openTerminal: TerminalError,
  listBranches: WorkspaceGitError,
  getChanges: WorkspaceGitError,
  getDiffContents: WorkspaceFileError,
  listFiles: WorkspaceGitError,
  readFile: WorkspaceFileError,
} satisfies Errors<typeof WorkspaceService>;

export type WorkspaceService = Reference<typeof WorkspaceService>;

/** Control only: input and output go over the byte channel `channel` admits. */
export const TerminalService = remote("supernova.terminal", {
  version: 3,
  params: {terminalId: str()},
  hostAddress: serverHost,
  variants: {
    owner: {
      methods: {
        channel: method(undefined, json<TerminalChannelResult>()),
        resize: method(TerminalResizePayload, nul()),
        theme: method(TerminalThemePayload, nul()),
      },
    },
  },
});

export const TerminalErrors = {
  channel: TerminalNotFoundError,
  resize: TerminalNotFoundError,
  theme: TerminalNotFoundError,
} satisfies Errors<typeof TerminalService>;

export type TerminalService = Reference<typeof TerminalService>;
