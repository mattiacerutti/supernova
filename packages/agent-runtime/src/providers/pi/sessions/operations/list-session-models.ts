import {Effect} from "effect";
import {AgentSessionModelsListError} from "@pi-desktop/contracts/sessions";
import {authStorage, modelRegistry} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/pi-provider-runtime";
import {toAgentModelDetails} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/model-mapper";

export function listSessionModels() {
  return Effect.tryPromise({
    try: async () => {
      authStorage.reload();
      modelRegistry.refresh();
      const models = await modelRegistry.getAvailable();

      return models.map((model) => toAgentModelDetails(model, modelRegistry.getProviderDisplayName(model.provider)));
    },
    catch: (cause) => new AgentSessionModelsListError({cause, message: cause instanceof Error ? cause.message : "Failed to list session models."}),
  });
}
