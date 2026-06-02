import type {Api, Model} from "@earendil-works/pi-ai";
import {describe, expect, it} from "vitest";
import {toAgentModelDetails} from "@supernova/agent-runtime/layers/sessions/lib/models/model-mapper";

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
  it.each([
    {expected: false, input: ["text"] as Model<Api>["input"], name: "text-only"},
    {expected: true, input: ["text", "image"] as Model<Api>["input"], name: "image-capable"},
  ])("exposes image capability for $name models", (testCase) => {
    expect(toAgentModelDetails(model({input: testCase.input}), "OpenAI Codex").capabilities.images).toBe(testCase.expected);
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
