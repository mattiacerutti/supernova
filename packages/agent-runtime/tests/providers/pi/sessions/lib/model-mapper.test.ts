import type {Api, Model} from "@mariozechner/pi-ai";
import {toAgentModelDetails} from "@pi-desktop/agent-runtime/providers/pi/sessions/lib/model-mapper";
import {describe, expect, it} from "vitest";

function model(overrides: Partial<Model<Api>>): Model<Api> {
  return {
    api: "openai-codex-responses",
    baseUrl: "https://chatgpt.com/backend-api",
    contextWindow: 272000,
    cost: {
      cacheRead: 0,
      cacheWrite: 0,
      input: 0,
      output: 0,
    },
    id: "test-model",
    input: ["text"],
    maxTokens: 128000,
    name: "Test Model",
    provider: "openai-codex",
    reasoning: true,
    ...overrides,
  };
}

describe("toAgentModelDetails", () => {
  it("deduplicates thinking levels that map to the same native value", () => {
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

  it("keeps canonical levels when an earlier rung aliases to them", () => {
    const details = toAgentModelDetails(
      model({
        id: "gpt-5.5",
        name: "GPT-5.5",
        thinkingLevelMap: {minimal: "low", xhigh: "xhigh"},
      }),
      "OpenAI Codex"
    );

    expect(details.thinkingLevels).toEqual([
      {label: "Off", value: "off"},
      {label: "Low", value: "low"},
      {label: "Medium", value: "medium"},
      {label: "High", value: "high"},
      {label: "Xhigh", value: "xhigh"},
    ]);
  });

  it("keeps non-Pi native aliases when there is no canonical Pi rung", () => {
    const details = toAgentModelDetails(
      model({
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        thinkingLevelMap: {minimal: "low", xhigh: "max"},
      }),
      "Anthropic"
    );

    expect(details.thinkingLevels).toEqual([
      {label: "Off", value: "off"},
      {label: "Low", value: "low"},
      {label: "Medium", value: "medium"},
      {label: "High", value: "high"},
      {label: "Max", value: "xhigh"},
    ]);
  });
});
