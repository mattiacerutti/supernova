import * as Schema from "effect/Schema";
import type {GetConfigurationPayload} from "@supernova/contracts/configuration/procedures";
import {GetConfigurationError, GetConfigurationResult} from "@supernova/contracts/configuration/procedures";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";

/** Client-safe view of the server's Pi settings. */
export class Configuration {
  /** Projects only supported frontend settings and validates them before crossing the RPC boundary. */
  public get(input: GetConfigurationPayload): GetConfigurationResult {
    try {
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
    } catch {
      throw new GetConfigurationError({message: "Unable to load configuration. Check the global and project settings.json files and model defaults."});
    }
  }
}
