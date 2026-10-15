import type {GetConfigurationPayload} from "@supernova/contracts/services/configuration/procedures";
import {GetConfigurationResult} from "@supernova/contracts/services/configuration/procedures";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";

export class Configuration {
  public get(input: GetConfigurationPayload): GetConfigurationResult {
    try {
      const settings = loadPiSettings(input.projectPath);
      const modelThinkingLevels = settings.getAllModelThinkingLevels();
      return GetConfigurationResult.parse({
        modelDefaults: {
          providerId: settings.getDefaultProvider(),
          modelId: settings.getDefaultModel(),
          thinkingLevel: settings.getDefaultThinkingLevel(),
          ...(Object.keys(modelThinkingLevels).length > 0 ? {modelThinkingLevels} : {}),
        },
      });
    } catch {
      throw new Error("Unable to load configuration. Check the global and project settings.json files and model defaults.");
    }
  }
}
