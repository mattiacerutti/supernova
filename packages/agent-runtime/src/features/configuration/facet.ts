import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {GetConfigurationPayload} from "@supernova/contracts/services/configuration/procedures";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import type {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";

export function configurationFacet(configuration: Configuration): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(ConfigurationService, (_params, principal) => {
      if (!isOwner(principal)) throw forbidden("Only the owner reads configuration.");
      return {variant: "owner", members: {get: method({payload: GetConfigurationPayload, run: (input) => configuration.get(input)})}};
    });
  });
}
