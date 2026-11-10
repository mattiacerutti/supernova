import type {GetConfigurationPayload} from "@supernova/contracts/services/configuration/procedures";
import {compile} from "@earendil-works/pi-schema";
import type {GetConfigurationResult} from "@supernova/contracts/services/configuration/procedures";
import {GetConfigurationResult as GetConfigurationResultSchema} from "@supernova/contracts/services/configuration/procedures";
import {loadPiSettings} from "@supernova/agent-runtime/pi/config/settings";

const validResult = compile(GetConfigurationResultSchema);

export class Configuration {
  public get(input: GetConfigurationPayload): GetConfigurationResult {
    try {
      const settings = loadPiSettings(input.projectPath);
      const modelThinkingLevels = settings.getAllModelThinkingLevels();
      const result = JSON.parse(
        JSON.stringify({
          modelDefaults: {
            providerId: settings.getDefaultProvider(),
            modelId: settings.getDefaultModel(),
            thinkingLevel: settings.getDefaultThinkingLevel(),
            ...(Object.keys(modelThinkingLevels).length > 0 ? {modelThinkingLevels} : {}),
          },
        })
      ) as unknown;
      // Pi reads settings files as they are, malformed or not.
      // Pi reads settings files as they are, malformed or not.
      // Pi reads settings files as they are, malformed or not.
      if (!validResult.check(result)) throw new Error("The configuration is invalid.");
      return result;
    } catch {
      throw new Error("Unable to load configuration. Check the global and project settings.json files and model defaults.");
    }
  }
}
