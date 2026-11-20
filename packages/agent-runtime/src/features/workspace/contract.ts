import {local, method, nul} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {TerminalOpenResult} from "@supernova/contracts/services/workspace/procedures";
import {TerminalClosePayload, TerminalOpenPayload} from "@supernova/contracts/services/workspace/procedures";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {Terminals} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminals";
import {nativeRegistry} from "@supernova/agent-runtime/lib/chord/natives";

export const TerminalsStore = local("supernova.store.terminals", {
  version: 1,
  params: {},
  members: {
    list: json<TerminalsState>(),
    open: method(TerminalOpenPayload, json<TerminalOpenResult>()),
    close: method(TerminalClosePayload, nul()),
    closeSession: method(json<{readonly sessionId: string}>(), nul()),
  },
});
export const TerminalsNative = nativeRegistry<Terminals>("supernova.native.terminals");
