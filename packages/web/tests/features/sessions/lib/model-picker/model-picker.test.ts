import type {ModelDetails} from "@pi-desktop/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {getModelPickerSections} from "@/features/sessions/lib/model-picker/model-picker";
import {modelKey} from "@/features/sessions/lib/model-picker/model-utils";

function model(overrides: Pick<ModelDetails, "id" | "name" | "providerId" | "providerName"> & Partial<ModelDetails>): ModelDetails {
  return {
    capabilities: {images: false, reasoning: true},
    thinkingLevels: [],
    ...overrides,
  };
}

function sectionSummary(input: ReturnType<typeof getModelPickerSections>): Array<{models: string[]; title: string}> {
  return input.map((section) => ({models: section.models.map((sectionModel) => modelKey(sectionModel.providerId, sectionModel.id)), title: section.title}));
}

function searchResultKeys(search: string, models: readonly ModelDetails[]): string[] {
  return getModelPickerSections({favoriteModelKeys: [], models, recentModelKeys: [], search}).flatMap((section) =>
    section.models.map((sectionModel) => modelKey(sectionModel.providerId, sectionModel.id))
  );
}

const openAiGpt = model({id: "gpt-4o", name: "GPT 4o", providerId: "openai", providerName: "OpenAI"});
const openAiGpt55 = model({id: "gpt-5.5", name: "GPT-5.5", providerId: "openai", providerName: "OpenAI"});
const anthropicClaude = model({id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", providerId: "anthropic", providerName: "Anthropic"});
const googleGemini = model({id: "gemini-3-pro", name: "Gemini 3 Pro", providerId: "google", providerName: "Google"});
const openAiO3 = model({id: "o3", name: "O3", providerId: "openai", providerName: "OpenAI"});

describe("getModelPickerSections", () => {
  it("pins favorites before recents and removes pinned models from provider sections", () => {
    const sections = getModelPickerSections({
      favoriteModelKeys: [modelKey(anthropicClaude.providerId, anthropicClaude.id)],
      models: [openAiGpt, anthropicClaude, googleGemini, openAiO3],
      recentModelKeys: [modelKey(anthropicClaude.providerId, anthropicClaude.id), modelKey(openAiGpt.providerId, openAiGpt.id)],
      search: "",
    });

    expect(sectionSummary(sections)).toEqual([
      {models: ["anthropic|claude-sonnet-4-5"], title: "Favorites"},
      {models: ["openai|gpt-4o"], title: "Recents"},
      {models: ["google|gemini-3-pro"], title: "Google"},
      {models: ["openai|o3"], title: "OpenAI"},
    ]);
  });

  it("searches compact provider and model names across pinned and provider sections", () => {
    const sections = getModelPickerSections({
      favoriteModelKeys: [modelKey(openAiGpt.providerId, openAiGpt.id)],
      models: [openAiGpt, anthropicClaude, googleGemini],
      recentModelKeys: [modelKey(anthropicClaude.providerId, anthropicClaude.id)],
      search: "anthropicclaudesonnet",
    });

    expect(sectionSummary(sections)).toEqual([{models: ["anthropic|claude-sonnet-4-5"], title: "Recents"}]);
  });

  it.each(["5.5", "gpt", "gpt 5.5", "gpt 5"])("matches GPT-5.5 when searching for %s", (search) => {
    expect(searchResultKeys(search, [openAiGpt, openAiGpt55, anthropicClaude])).toContain("openai|gpt-5.5");
  });

  it("handles punctuation and spacing differences in common model-name searches", () => {
    const models = [openAiGpt, openAiGpt55, anthropicClaude, googleGemini, openAiO3];

    expect(searchResultKeys("gpt55", models)).toContain("openai|gpt-5.5");
    expect(searchResultKeys("gpt-5", models)).toContain("openai|gpt-5.5");
    expect(searchResultKeys("sonnet 4.5", models)).toContain("anthropic|claude-sonnet-4-5");
    expect(searchResultKeys("sonnet 4", models)).toContain("anthropic|claude-sonnet-4-5");
    expect(searchResultKeys("gemini3", models)).toContain("google|gemini-3-pro");
  });

  it("lets users combine provider and model terms without requiring exact provider-model formatting", () => {
    const models = [openAiGpt, openAiGpt55, anthropicClaude, googleGemini];

    expect(searchResultKeys("openai gpt5", models)).toContain("openai|gpt-5.5");
    expect(searchResultKeys("anthropic sonnet", models)).toContain("anthropic|claude-sonnet-4-5");
    expect(searchResultKeys("google pro", models)).toContain("google|gemini-3-pro");
  });
});
