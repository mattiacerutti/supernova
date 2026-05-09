import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions";
import {modelKey} from "@/features/sessions/lib/model-selection";

export interface IModelPickerSection {
  readonly models: readonly IAgentModelDetails[];
  readonly title: string;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactSearchText(value: string): string {
  return normalizeSearchText(value).replaceAll(" ", "");
}

function scoreSearchValue(value: string, normalizedQuery: string, compactQuery: string): number | null {
  const normalizedValue = normalizeSearchText(value);
  const compactValue = compactSearchText(value);

  if (!normalizedValue || !compactValue) return null;
  if (normalizedValue === normalizedQuery || compactValue === compactQuery) return 0;
  if (normalizedValue.startsWith(normalizedQuery)) return 10 + normalizedValue.length - normalizedQuery.length;
  if (compactValue.startsWith(compactQuery)) return 20 + compactValue.length - compactQuery.length;

  const normalizedIndex = normalizedValue.indexOf(normalizedQuery);
  if (normalizedIndex !== -1) return 30 + normalizedIndex * 2 + normalizedValue.length - normalizedQuery.length;

  const compactIndex = compactValue.indexOf(compactQuery);
  if (compactIndex !== -1) return 40 + compactIndex * 2 + compactValue.length - compactQuery.length;

  return null;
}

function scoreModelSearch(model: IAgentModelDetails, search: string): number | null {
  const normalizedQuery = normalizeSearchText(search);
  if (!normalizedQuery) return 0;

  const compactQuery = compactSearchText(search);
  const scores = [model.name, model.displayName, model.id, model.providerName, model.providerId].flatMap((value) => {
    const score = scoreSearchValue(value, normalizedQuery, compactQuery);
    return score === null ? [] : [score];
  });

  if (scores.length === 0) return null;
  return Math.min(...scores);
}

function filterAndSortModels(models: readonly IAgentModelDetails[], search: string): IAgentModelDetails[] {
  if (!normalizeSearchText(search)) return [...models];

  return models
    .flatMap((model) => {
      const score = scoreModelSearch(model, search);
      return score === null ? [] : [{model, score}];
    })
    .sort((left, right) => left.score - right.score || left.model.name.localeCompare(right.model.name))
    .map((result) => result.model);
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
