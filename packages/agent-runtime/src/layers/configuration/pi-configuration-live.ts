import {Layer} from "effect";
import {ConfigurationService} from "@supernova/agent-runtime/services/configuration-service";
import {getConfiguration} from "@supernova/agent-runtime/layers/configuration/operations/get-configuration";

export const PiConfigurationLive = Layer.succeed(ConfigurationService, {get: getConfiguration});
