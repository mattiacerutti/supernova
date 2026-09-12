import type {ModelReference} from "@supernova/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import type {PiModel, PiModelCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-model-catalog";
import {findSelectedModel} from "@supernova/agent-runtime/layers/session-runtime/lib/models/selected-model";

const modelReference: ModelReference = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

const model = {
  api: "anthropic-messages",
  baseUrl: "https://api.anthropic.com",
  contextWindow: 200_000,
  cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0},
  id: "claude-sonnet",
  input: ["text"],
  maxTokens: 8192,
  name: "Claude Sonnet",
  provider: "anthropic",
  reasoning: true,
} as PiModel;

function catalog(input: {readonly all: readonly PiModel[]; readonly available: readonly PiModel[]}): PiModelCatalogShape {
  return {
    getModel: (providerId, modelId) => input.all.find((candidate) => candidate.provider === providerId && candidate.id === modelId),
    getAvailableModels: () => input.available,
    getProviderDisplayName: (providerId) => providerId,
    restoreModels: async () => undefined,
    refreshAuthAndModels: async () => undefined,
  };
}

describe("findSelectedModel", () => {
  it("resolves a registered model even when the availability snapshot has not caught up", () => {
    expect(findSelectedModel(catalog({all: [model], available: []}), modelReference)).toBe(model);
  });

  it("throws when the model is not registered by any provider", () => {
    expect(() => findSelectedModel(catalog({all: [], available: []}), modelReference)).toThrow("Selected model is not available.");
  });
});
