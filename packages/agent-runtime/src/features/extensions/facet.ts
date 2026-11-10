import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {RuntimeNative, SessionHostsNative} from "@supernova/agent-runtime/core/contract";
import {ExtensionsStore} from "@supernova/agent-runtime/features/extensions/contract";
import {Extensions} from "@supernova/agent-runtime/features/extensions/natives/extensions";
import {action} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf} from "@supernova/agent-runtime/lib/chord/natives";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";

export const extensionsFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  host.serve(ExtensionsStore, (_params, self) => {
    const natives = nativeOf(self, RuntimeNative);
    const hosts = nativeOf(self, SessionHostsNative);

    const extensions = self.open(
      async () => new Extensions(natives()),
      () => undefined
    );

    return {
      update: async () => {
        try {
          await extensions.value.update();
        } finally {
          // Even a partial failure may have replaced packages on disk.
          await hosts().reload();
        }
        return null;
      },
    };
  });

  host.serve(ExtensionsService, (_params, principal, self) => {
    if (!isOwner(principal)) throw forbidden("Only the owner manages extensions.");

    const extensions = self.get(ExtensionsStore, {});

    return {variant: "owner", members: {update: action((ctx) => extensions.update(ctx))}};
  });
});
