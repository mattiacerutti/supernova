import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {UpdateExtensionsError} from "@supernova/contracts/services/extensions/procedures";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {action} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import type {Extensions} from "@supernova/agent-runtime/features/extensions/extensions";
import type {SessionStore} from "@supernova/agent-runtime/pi/session-store";

export function extensionsFacet(extensions: Extensions, store: Pick<SessionStore, "reload">): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(ExtensionsService, (_params, principal) => {
      if (!isOwner(principal)) throw forbidden("Only the owner manages extensions.");
      return {
        variant: "owner",
        members: {
          update: action({
            run: async () => {
              try {
                await extensions.update();
              } finally {
                // Even a partial failure may have replaced packages on disk, so every session reloads either way.
                await store.reload();
              }
              return null;
            },
            error: UpdateExtensionsError,
          }),
        },
      };
    });
  });
}
