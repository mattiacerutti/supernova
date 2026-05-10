import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions";
import {describe, expect, it} from "vitest";
import {resolveThinkingLevel} from "@/features/sessions/lib/model-picker/model-utils";

function model(thinkingLevels: IAgentModelDetails["thinkingLevels"]): IAgentModelDetails {
  return {
    capabilities: {attachments: false, reasoning: true, toolCalls: true},
    id: "claude-sonnet",
    name: "Claude Sonnet",
    providerId: "anthropic",
    providerName: "Anthropic",
    thinkingLevels,
  };
}

describe("resolveThinkingLevel", () => {
  it("keeps a supported preference and otherwise picks the closest ranked level", () => {
    const details = model([
      {label: "Off", value: "off"},
      {label: "Medium", value: "medium"},
      {label: "High", value: "high"},
    ]);

    expect(resolveThinkingLevel(details, "medium")).toBe("medium");
    expect(resolveThinkingLevel(details, "low")).toBe("medium");
    expect(resolveThinkingLevel(details, "xhigh")).toBe("high");
  });

  it("falls back predictably when no ranked match is available", () => {
    expect(resolveThinkingLevel(model([{label: "Auto", value: "auto"}]), "high")).toBe("auto");
    expect(resolveThinkingLevel(model([]), "high")).toBeUndefined();
  });
});
