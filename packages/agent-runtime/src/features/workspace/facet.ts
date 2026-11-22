import type {Facet, FacetHost} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {TerminalNotFoundError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {TerminalsNative, TerminalsStore} from "@supernova/agent-runtime/features/workspace/contract";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/lib/terminal/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminals";
import {getChanges, getDiffContents, listBranches, listFiles, listRepositories, readFile} from "@supernova/agent-runtime/features/workspace/workspace";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf, serveNative} from "@supernova/agent-runtime/lib/chord/natives";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {derivedState} from "@supernova/agent-runtime/lib/chord/state";

export const workspaceFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  serveTerminalsStore(host);
  serveWorkspaceService(host);
  serveTerminalService(host);
});

function serveTerminalsStore(host: FacetHost<RuntimePrincipal>): void {
  serveNative(host, TerminalsNative);

  host.serve(TerminalsStore, (_params, self) => {
    const list = self.writable<TerminalsState>({terminals: {}});

    const terminals = self.open(
      async () => new Terminals({spawnPty, list}),
      (opened) => opened.shutdown()
    );
    self.contribute(TerminalsNative, terminals);

    return {
      list: derivedState(self, [list], ([value]) => value),
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

    self.get(TerminalsStore, {});
    const terminals = nativeOf(self, TerminalsNative);

    // Holds of one terminal share this object, so its end closes every viewer it admitted.
    const viewers = self.open(
      async () => {
        if (!terminals().has(terminalId)) throw new TerminalNotFoundError({message: "Terminal not found."});
        const owner = {};
        terminals().hold(owner);
        return owner;
      },
      (owner) => terminals().release(owner)
    );

    return {
      variant: "owner",
      members: {
        channel: action(() => ({token: terminals().grant(terminalId, viewers.value)})),
        resize: method((input) => terminals().resize(terminalId, input)),
        theme: method((input) => terminals().setTheme(terminalId, input)),
      },
    };
  });
}
