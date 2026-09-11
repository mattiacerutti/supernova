import {Context} from "effect";
import type {Effect} from "effect";
import type {GetConfigurationError, GetConfigurationPayload, GetConfigurationResult} from "@supernova/contracts/configuration/procedures";

export interface ConfigurationServiceShape {
  readonly get: (input: GetConfigurationPayload) => Effect.Effect<GetConfigurationResult, GetConfigurationError>;
}

/** Provides effective client-safe configuration from server-owned settings. */
export class ConfigurationService extends Context.Service<ConfigurationService, ConfigurationServiceShape>()("supernova/agent-runtime/ConfigurationService") {}
