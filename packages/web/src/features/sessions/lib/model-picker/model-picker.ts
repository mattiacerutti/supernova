import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions/schemas";
import {matchSorter} from "match-sorter";
import {modelKey} from "@/features/sessions/lib/model-picker/model-utils";

export interface IModelPickerSection {
  readonly models: readonly IAgentModelDetails[];
  readonly title: string;
}

function compactSearchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function spacedSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchValueVariants(value: string): string[] {
  return [value, compactSearchValue(value), spacedSearchValue(value)];
}

function modelSearchKeys(model: IAgentModelDetails): string[] {
  const key = modelKey(model.providerId, model.id);
  const providerModelName = `${model.providerName} ${model.name}`;
  const providerModelId = `${model.providerId} ${model.id}`;

  return [model.name, model.id, model.providerName, model.providerId, key, providerModelName, providerModelId].flatMap(searchValueVariants);
}

function filterAndSortModels(models: readonly IAgentModelDetails[], search: string): IAgentModelDetails[] {
  const query = search.trim();
  if (!query) return [...models];

  return matchSorter(models, query, {keys: [modelSearchKeys]});
}

function modelsFromKeys(modelsByKey: Map<string, IAgentModelDetails>, keys: readonly string[]): IAgentModelDetails[] {
  return keys.flatMap((key) => {
    const model = modelsByKey.get(key);
    return model ? [model] : [];
  });
}

function groupByProvider(models: readonly IAgentModelDetails[]): IModelPickerSection[] {
  const sections = new Map<string, IAgentModelDetails[]>();

  for (const model of models) {
    const section = sections.get(model.providerName) ?? [];
    section.push(model);
    sections.set(model.providerName, section);
  }

  return Array.from(sections.entries()).map(([title, sectionModels]) => ({models: sectionModels, title}));
}

export function getModelPickerSections(input: {
  readonly favoriteModelKeys: readonly string[];
  readonly models: readonly IAgentModelDetails[];
  readonly recentModelKeys: readonly string[];
  readonly search: string;
}): IModelPickerSection[] {
  const modelsByKey = new Map(input.models.map((model) => [modelKey(model.providerId, model.id), model]));
  const favoriteKeySet = new Set(input.favoriteModelKeys);
  const favoriteModels = filterAndSortModels(modelsFromKeys(modelsByKey, input.favoriteModelKeys), input.search);
  const recentModels = filterAndSortModels(
    modelsFromKeys(modelsByKey, input.recentModelKeys).filter((model) => !favoriteKeySet.has(modelKey(model.providerId, model.id))),
    input.search
  );
  const pinnedModelKeys = new Set([...favoriteModels, ...recentModels].map((model) => modelKey(model.providerId, model.id)));
  const filteredModels = filterAndSortModels(
    input.models.filter((model) => !pinnedModelKeys.has(modelKey(model.providerId, model.id))),
    input.search
  );
  const pinnedSections: IModelPickerSection[] = [];

  if (favoriteModels.length > 0) {
    pinnedSections.push({models: favoriteModels, title: "Favorites"});
  }

  if (recentModels.length > 0) {
    pinnedSections.push({models: recentModels, title: "Recents"});
  }

  return [...pinnedSections, ...groupByProvider(filteredModels)];
}
