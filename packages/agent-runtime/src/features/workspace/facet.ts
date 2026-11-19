import type {Facet, FacetHost} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {TerminalsNative, TerminalsStore} from "@supernova/agent-runtime/features/workspace/contract";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/lib/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/natives/terminals";
import {getChanges, getDiffContents, listBranches, listFiles, listRepositories, readFile} from "@supernova/agent-runtime/features/workspace/workspace";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf, serveNative} from "@supernova/agent-runtime/lib/chord/natives";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {derivedState} from "@supernova/agent-runtime/lib/chord/state";

const NO_OUTPUT: TerminalOutput = {output: "", dropped: 0};

export const workspaceFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  serveTerminalsStore(host);
  serveWorkspaceService(host);
  serveTerminalService(host);
});

function serveTerminalsStore(host: FacetHost<RuntimePrincipal>): void {
  serveNative(host, TerminalsNative);

  host.serve(TerminalsStore, (_params, self) => {
    const list = self.writable<TerminalsState>({terminals: {}});
    const outputs = self.writable<Readonly<Record<string, TerminalOutput>>>({});

    const terminals = self.open(
      async () => new Terminals({spawnPty, list: list, outputs: outputs}),
      (opened) => opened.shutdown()
    );
    self.contribute(TerminalsNative, terminals);

    return {
      list: derivedState(self, [list], ([value]) => value),
      outputs: derivedState(self, [outputs], ([value]) => value),
      open: (input) => terminals.value.open(input),
      close: async (input) => {
        await terminals.value.close(input);
        return null;
      },
      closeSession: async ({sessionId}) => {
        await terminals.value.closeSession(sessionId);
        return null;
      },
    };
  });
}

function serveWorkspaceService(host: FacetHost<RuntimePrincipal>): void {
  host.serve(WorkspaceService, (_params, principal, self) => {
    if (!isOwner(principal)) throw forbidden("Only the owner uses the workspace.");

    const terminals = self.get(TerminalsStore, {});

    return {
      variant: "owner",
      members: {
        terminals: terminals.list,
        openTerminal: method((input, ctx) => terminals.open(input, ctx)),
        closeTerminal: method((input, ctx) => terminals.close(input, ctx)),
        listBranches: method((input) => listBranches(input)),
        getChanges: method((input) => getChanges(input)),
        getDiffContents: method((input) => getDiffContents(input)),
        listRepositories: method((input) => listRepositories(input)),
        listFiles: method((input) => listFiles(input)),
        readFile: method((input) => readFile(input)),
      },
    };
  });
}

function serveTerminalService(host: FacetHost<RuntimePrincipal>): void {
  host.serve(TerminalService, ({terminalId}, principal, self) => {
    if (!isOwner(principal)) throw forbidden("Only the owner uses terminals.");

    const store = self.get(TerminalsStore, {});
    const terminals = nativeOf(self, TerminalsNative);

    self.open(
      async () => {
        if (!terminals().has(terminalId)) throw new TerminalNotFoundError({message: "Terminal not found."});
      },
      () => undefined
    );

    return {
      variant: "owner",
      members: {
        output: derivedState(self, [store.outputs], ([outputs]) => outputs[terminalId] ?? NO_OUTPUT),
        write: method((input) => terminals().write(terminalId, input)),
        resize: method((input) => terminals().resize(terminalId, input)),
      },
    };
  });
}
