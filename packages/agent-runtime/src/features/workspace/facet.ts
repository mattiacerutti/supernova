import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalResizePayload,
  TerminalWritePayload,
  WorkspaceBranchesListPayload,
  WorkspaceChangesGetPayload,
  WorkspaceDiffContentsGetPayload,
  WorkspaceFileReadPayload,
  WorkspaceFilesListPayload,
  WorkspaceRepositoriesListPayload,
} from "@supernova/contracts/services/workspace/procedures";
import {TerminalError, TerminalNotFoundError, WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {published} from "@supernova/agent-runtime/lib/chord/state";
import type {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import type {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";

export function workspaceFacet(workspace: Workspace, terminals: Terminals): Facet<RuntimePrincipal> {
  const listNow = (): TerminalsState => ({terminals: Object.fromEntries(terminals.list().map((terminal) => [terminal.id, terminal]))});
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(WorkspaceService, (_params, principal, self) => {
      if (!isOwner(principal)) throw forbidden("Only the owner uses the workspace.");
      // Output is not here: each terminal's is its own `TerminalService`, sent only to clients showing it.
      const list = published(self, listNow());
      self.open(
        async () => terminals.onChange(() => list.set(listNow())),
        (stop) => stop()
      );
      return {
        variant: "owner",
        members: {
          terminals: list.member,
          openTerminal: method({payload: TerminalOpenPayload, run: (input) => workspace.openTerminal(input), error: TerminalError}),
          closeTerminal: method({payload: TerminalClosePayload, run: (input) => workspace.closeTerminal(input).then(() => null)}),
          listBranches: method({payload: WorkspaceBranchesListPayload, run: (input) => workspace.listBranches(input), error: WorkspaceGitError}),
          getChanges: method({payload: WorkspaceChangesGetPayload, run: (input) => workspace.getChanges(input), error: WorkspaceGitError}),
          getDiffContents: method({payload: WorkspaceDiffContentsGetPayload, run: (input) => workspace.getDiffContents(input), error: WorkspaceFileError}),
          listRepositories: method({payload: WorkspaceRepositoriesListPayload, run: (input) => workspace.listRepositories(input)}),
          listFiles: method({payload: WorkspaceFilesListPayload, run: (input) => workspace.listFiles(input), error: WorkspaceGitError}),
          readFile: method({payload: WorkspaceFileReadPayload, run: (input) => workspace.readFile(input), error: WorkspaceFileError}),
        },
      };
    });

    host.serve(TerminalService, ({terminalId}, principal, self) => {
      if (!isOwner(principal)) throw forbidden("Only the owner uses terminals.");
      // Releasing never ends the shell.
      self.open(
        async () => {
          if (!workspace.hasTerminal(terminalId)) throw new TerminalNotFoundError({message: "Terminal not found."});
        },
        () => undefined
      );
      const output = published(self, terminals.output(terminalId) ?? {output: "", dropped: 0});
      self.open(
        async () =>
          terminals.onChange(({terminalId: changed}) => {
            const current = changed === terminalId ? terminals.output(terminalId) : undefined;
            if (current) output.set(current);
          }),
        (stop) => stop()
      );
      return {
        variant: "owner",
        members: {
          output: output.member,
          write: method({
            payload: TerminalWritePayload.omit({id: true}),
            run: (input) => workspace.writeTerminal({...input, id: terminalId}).then(() => null),
            error: TerminalNotFoundError,
          }),
          resize: method({
            payload: TerminalResizePayload.omit({id: true}),
            run: (input) => workspace.resizeTerminal({...input, id: terminalId}).then(() => null),
            error: TerminalNotFoundError,
          }),
        },
      };
    });
  });
}
