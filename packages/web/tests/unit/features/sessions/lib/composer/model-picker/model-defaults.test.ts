import type {ModelDetails, ModelReference} from "@supernova/contracts/sessions/schemas";
import type {ModelDefaults} from "@supernova/contracts/configuration/schemas";
import {describe, expect, it} from "vitest";
import {resolveComposerModelSelection} from "@/features/sessions/lib/composer/model-picker/model-defaults";

const models: readonly ModelDetails[] = [
  {id: "first", name: "First", providerId: "a", providerName: "A", capabilities: {images: false, reasoning: false}, thinkingLevels: []},
  {
    id: "preferred",
    name: "Preferred",
    providerId: "b",
    providerName: "B",
    capabilities: {images: true, reasoning: true},
    thinkingLevels: [
      {value: "off", label: "Off"},
      {value: "high", label: "High"},
    ],
  },
];

interface SelectionCase {
  name: string;
  defaults?: ModelDefaults;
  activeSelection?: ModelReference;
  isNewSession?: boolean;
  expectedId: string;
  expectedThinking?: string;
}

const cases: readonly SelectionCase[] = [
  {name: "keeps recent selection without defaults", expectedId: "first"},
  {
    name: "uses provider and model defaults before recents",
    defaults: {providerId: "b", modelId: "preferred", thinkingLevel: "high"},
    expectedId: "preferred",
    expectedThinking: "high",
  },
  {
    name: "uses per-model reasoning before the general default",
    defaults: {modelId: "preferred", thinkingLevel: "off", modelThinkingLevels: {"b/preferred": "high"}},
    expectedId: "preferred",
    expectedThinking: "high",
  },
  {
    name: "honors per-model off reasoning",
    defaults: {modelId: "preferred", thinkingLevel: "high", modelThinkingLevels: {"b/preferred": "off"}},
    expectedId: "preferred",
    expectedThinking: "off",
  },
  {
    name: "matches the provider as well as the model ID",
    defaults: {modelId: "preferred", thinkingLevel: "off", modelThinkingLevels: {"a/preferred": "high"}},
    expectedId: "preferred",
    expectedThinking: "off",
  },
  {
    name: "clamps per-model reasoning to supported levels",
    defaults: {modelId: "preferred", modelThinkingLevels: {"b/preferred": "max"}},
    expectedId: "preferred",
    expectedThinking: "high",
  },
  {
    name: "ignores per-model reasoning for a model without reasoning",
    defaults: {modelId: "first", modelThinkingLevels: {"a/first": "high"}},
    expectedId: "first",
  },
  {name: "accepts a provider-only default", defaults: {providerId: "b"}, expectedId: "preferred", expectedThinking: "off"},
  {name: "accepts an exact model-only default", defaults: {modelId: "preferred"}, expectedId: "preferred", expectedThinking: "off"},
  {name: "does not match a model belonging to another provider", defaults: {providerId: "a", modelId: "preferred"}, expectedId: "first"},
  {name: "falls back for an unavailable default", defaults: {modelId: "missing"}, expectedId: "first"},
  {name: "clamps configured reasoning to supported levels", defaults: {modelId: "preferred", thinkingLevel: "max"}, expectedId: "preferred", expectedThinking: "high"},
  {name: "omits reasoning for a model without it", defaults: {modelId: "first", thinkingLevel: "high"}, expectedId: "first"},
  {name: "preserves explicit model choice", defaults: {modelId: "preferred"}, activeSelection: {providerId: "a", id: "first"}, expectedId: "first"},
  {
    name: "preserves explicit off reasoning",
    defaults: {thinkingLevel: "high", modelThinkingLevels: {"b/preferred": "high"}},
    activeSelection: {providerId: "b", id: "preferred", thinkingLevel: "off"},
    expectedId: "preferred",
    expectedThinking: "off",
  },
  {
    name: "preserves a resumed selection",
    isNewSession: false,
    defaults: {modelId: "first", thinkingLevel: "off", modelThinkingLevels: {"b/preferred": "off"}},
    activeSelection: {providerId: "b", id: "preferred", thinkingLevel: "high"},
    expectedId: "preferred",
    expectedThinking: "high",
  },
  {
    name: "does not apply startup defaults to a resumed session's fallback",
    isNewSession: false,
    defaults: {modelId: "preferred"},
    activeSelection: {providerId: "missing", id: "missing"},
    expectedId: "first",
  },
];

describe("composer model defaults", () => {
  it.each(cases)("$name", ({defaults, activeSelection, isNewSession = true, expectedId, expectedThinking}) => {
    const selection = resolveComposerModelSelection({models, defaults, activeSelection, isNewSession, recentModelKeys: ["a|first"], lastThinkingLevel: "off"});
    expect(selection.modelReference?.id).toBe(expectedId);
    expect(selection.modelReference?.thinkingLevel).toBe(expectedThinking);
  });

  it.each([{thinkingLevel: "high"}, {modelThinkingLevels: {"b/preferred": "high"}}, {modelId: "missing", modelThinkingLevels: {"b/preferred": "high"}}] satisfies ModelDefaults[])(
    "uses reasoning defaults with the recent model: %j",
    (defaults) => {
      const selection = resolveComposerModelSelection({models, defaults, isNewSession: true, recentModelKeys: ["b|preferred"], lastThinkingLevel: "off"});
      expect(selection.modelReference).toEqual({providerId: "b", id: "preferred", thinkingLevel: "high"});
    }
  );

  it("returns no model when no authenticated models are available", () => {
    const selection = resolveComposerModelSelection({models: [], defaults: {modelId: "preferred"}, isNewSession: true, recentModelKeys: []});
    expect(selection.modelReference).toBeUndefined();
  });

  it("does not replace an explicit choice when refreshed defaults change", () => {
    const activeSelection = {providerId: "b", id: "preferred", thinkingLevel: "off"};
    for (const defaults of [{modelId: "first"}, {modelId: "missing"}, {thinkingLevel: "high" as const}]) {
      const selection = resolveComposerModelSelection({models, defaults, activeSelection, isNewSession: true, recentModelKeys: []});
      expect(selection.modelReference).toEqual(activeSelection);
    }
  });
});
