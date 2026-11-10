import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {following} from "@supernova/agent-runtime/lib/chord/state";
import type {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import type {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";

export function workspaceFacet(workspace: Workspace, terminals: Terminals): Facet<RuntimePrincipal> {
  const listNow = (): TerminalsState => ({terminals: Object.fromEntries(terminals.list().map((terminal) => [terminal.id, terminal]))});

  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(WorkspaceService, (_params, principal, self) => {
      if (!isOwner(principal)) throw forbidden("Only the owner uses the workspace.");

      const list = following(self, listNow, (changed) => terminals.onChange(changed));

      return {
        variant: "owner",
        members: {
          terminals: list.member,
          openTerminal: method((input) => workspace.openTerminal(input)),
          closeTerminal: method((input) => workspace.closeTerminal(input)),
          listBranches: method((input) => workspace.listBranches(input)),
          getChanges: method((input) => workspace.getChanges(input)),
          getDiffContents: method((input) => workspace.getDiffContents(input)),
          listRepositories: method((input) => workspace.listRepositories(input)),
          listFiles: method((input) => workspace.listFiles(input)),
          readFile: method((input) => workspace.readFile(input)),
        },
      };
    });

    host.serve(TerminalService, ({terminalId}, principal, self) => {
      if (!isOwner(principal)) throw forbidden("Only the owner uses terminals.");

      self.open(
        async () => {
          if (!workspace.hasTerminal(terminalId)) throw new TerminalNotFoundError({message: "Terminal not found."});
        },
        () => undefined
      );

      const output = following(
        self,
        () => terminals.output(terminalId) ?? {output: "", dropped: 0},
        (changed) => terminals.onChange((change) => change.terminalId === terminalId && changed())
      );

      return {
        variant: "owner",
        members: {
          output: output.member,
          write: method((input) => workspace.writeTerminal(terminalId, input)),
          resize: method((input) => workspace.resizeTerminal(terminalId, input)),
        },
      };
    });
  });
}
