import {Effect, Schema} from "effect";
import {GetConfigurationError, GetConfigurationResult} from "@supernova/contracts/configuration/procedures";
import type {GetConfigurationPayload} from "@supernova/contracts/configuration/procedures";
import {loadPiSettings} from "@supernova/agent-runtime/layers/shared/lib/pi-settings";

/** Projects only supported frontend settings and validates them before crossing the RPC boundary. */
export function getConfiguration(input: GetConfigurationPayload) {
  return Effect.try({
    try: () => {
      const settings = loadPiSettings(input.projectPath);
      const modelThinkingLevels = settings.getAllModelThinkingLevels();
      return Schema.decodeUnknownSync(GetConfigurationResult)({
        modelDefaults: {
          providerId: settings.getDefaultProvider(),
          modelId: settings.getDefaultModel(),
          thinkingLevel: settings.getDefaultThinkingLevel(),
          modelThinkingLevels: Object.keys(modelThinkingLevels).length > 0 ? modelThinkingLevels : undefined,
        },
      });
    },
    catch: () => new GetConfigurationError({message: "Unable to load configuration. Check the global and project settings.json files and model defaults."}),
  });
}
