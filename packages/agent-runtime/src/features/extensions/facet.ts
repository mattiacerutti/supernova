import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {action} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import type {Extensions} from "@supernova/agent-runtime/features/extensions/extensions";

export function extensionsFacet(extensions: Extensions, reloadSessions: () => Promise<void>): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(ExtensionsService, (_params, principal) => {
      if (!isOwner(principal)) throw forbidden("Only the owner manages extensions.");

      return {
        variant: "owner",
        members: {
          update: action(async () => {
            try {
              await extensions.update();
            } finally {
              // Even a partial failure may have replaced packages on disk.
              await reloadSessions();
            }
          }),
        },
      };
    });
  });
}
