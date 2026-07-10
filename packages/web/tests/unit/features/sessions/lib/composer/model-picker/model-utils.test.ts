import type {ModelDetails} from "@supernova/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {resolveThinkingLevel} from "@/features/sessions/lib/composer/model-picker/model-utils";

function model(thinkingLevels: ModelDetails["thinkingLevels"]): ModelDetails {
  return {
    capabilities: {images: false, reasoning: true},
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
    expect(resolveThinkingLevel(details, "max")).toBe("high");
  });

  it("uses max as the highest ranked thinking level", () => {
    const details = model([
      {label: "Medium", value: "medium"},
      {label: "Extra High", value: "xhigh"},
      {label: "Max", value: "max"},
    ]);

    expect(resolveThinkingLevel(details, "xhigh")).toBe("xhigh");
    expect(resolveThinkingLevel(details, "max")).toBe("max");
  });

  it("falls back predictably when no ranked match is available", () => {
    expect(resolveThinkingLevel(model([{label: "Auto", value: "auto"}]), "high")).toBe("auto");
    expect(resolveThinkingLevel(model([]), "high")).toBeUndefined();
  });
});
