import type {Api, Model} from "@earendil-works/pi-ai";
import {describe, expect, it} from "vitest";
import {toAgentModelDetails} from "@supernova/agent-runtime/implementations/pi/sessions/lib/models/model-mapper";

function model(overrides: Partial<Model<Api>>): Model<Api> {
  return {
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
    contextWindow: 272000,
    cost: {cacheRead: 0, cacheWrite: 0, input: 0, output: 0},
    id: "test-model",
    input: ["text"],
    maxTokens: 128000,
    name: "Test Model",
    provider: "openai-codex",
    reasoning: true,
    ...overrides,
  };
}

describe("mapping Pi models", () => {
  it("exposes image capability only for image-capable models", () => {
    expect(toAgentModelDetails(model({input: ["text"]}), "OpenAI Codex").capabilities.images).toBe(false);
    expect(toAgentModelDetails(model({input: ["text", "image"]}), "OpenAI Codex").capabilities.images).toBe(true);
  });

  it("deduplicates provider-native thinking levels while keeping canonical choices", () => {
    const details = toAgentModelDetails(
      model({
        id: "gpt-5.1-codex-mini",
        name: "GPT-5.1 Codex Mini",
        thinkingLevelMap: {high: "high", low: "medium", medium: "medium", minimal: "medium"},
      }),
      "OpenAI Codex"
    );

    expect(details.thinkingLevels).toEqual([
      {label: "Off", value: "off"},
      {label: "Medium", value: "medium"},
      {label: "High", value: "high"},
    ]);
  });

  it("uses provider-native labels for aliases without a canonical rung", () => {
    const details = toAgentModelDetails(model({thinkingLevelMap: {minimal: "low", xhigh: "max"}}), "Anthropic");

    expect(details.thinkingLevels).toEqual([
      {label: "Off", value: "off"},
      {label: "Low", value: "low"},
      {label: "Medium", value: "medium"},
      {label: "High", value: "high"},
      {label: "Max", value: "xhigh"},
    ]);
  });
});
