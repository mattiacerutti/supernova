import type {ModelReference} from "@supernova/contracts/services/sessions/schemas";
import {describe, expect, it} from "vitest";
import type {PiModel, PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {findSelectedModel} from "@supernova/agent-runtime/pi/lib/models/selected-model";

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

function catalog(input: {readonly all: readonly PiModel[]}): Pick<PiSdk, "modelRuntime"> {
  return {
    modelRuntime: {
      getModel: (providerId: string, modelId: string) => input.all.find((candidate) => candidate.provider === providerId && candidate.id === modelId),
    } as unknown as PiSdk["modelRuntime"],
  };
}

describe("findSelectedModel", () => {
  it("resolves a registered model even when the availability snapshot has not caught up", () => {
    expect(findSelectedModel(catalog({all: [model]}), modelReference)).toBe(model);
  });

  it("throws when the model is not registered by any provider", () => {
    expect(() => findSelectedModel(catalog({all: []}), modelReference)).toThrow("Selected model is not available.");
  });
});
