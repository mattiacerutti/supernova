import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {getConfiguration} from "@supernova/agent-runtime/features/configuration/configuration";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";

export const configurationFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  host.serve(ConfigurationService, (_params, principal) => {
    if (!isOwner(principal)) throw forbidden("Only the owner reads configuration.");

    return {variant: "owner", members: {get: method((input) => getConfiguration(input))}};
  });
});
