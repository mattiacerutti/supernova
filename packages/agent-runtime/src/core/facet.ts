import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {RuntimeNatives, RuntimePaths, SessionHostsControl} from "@supernova/agent-runtime/core/contract";
import {RuntimeConfig, RuntimeNative, SessionHostsNative, SessionInfo} from "@supernova/agent-runtime/core/contract";
import {serveNative} from "@supernova/agent-runtime/lib/chord/natives";
import {constantState} from "@supernova/agent-runtime/lib/chord/state";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";

export function serverCoreFacet(paths: RuntimePaths, natives: RuntimeNatives, hosts: SessionHostsControl): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host, self) => {
    host.serve(RuntimeConfig, () => ({paths: constantState(paths)}));

    serveNative(host, RuntimeNative);
    self.contribute(RuntimeNative, {value: natives});

    serveNative(host, SessionHostsNative);
    self.contribute(SessionHostsNative, {value: hosts});
  });
}

export function sessionCoreFacet(paths: RuntimePaths, natives: RuntimeNatives, record: SessionRecord): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host, self) => {
    host.serve(RuntimeConfig, () => ({paths: constantState(paths)}));
    host.serve(SessionInfo, () => ({record: constantState(record)}));

    serveNative(host, RuntimeNative);
    self.contribute(RuntimeNative, {value: natives});
  });
}
