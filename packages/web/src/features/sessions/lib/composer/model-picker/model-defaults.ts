import type {ModelDefaults} from "@supernova/contracts/configuration/schemas";
import type {ModelDetails, ModelReference} from "@supernova/contracts/sessions/schemas";
import {createModelReference, modelKey, resolveThinkingLevel} from "@/features/sessions/lib/composer/model-picker/model-utils";

interface ResolveComposerModelSelectionOptions {
  readonly models: readonly ModelDetails[];
  readonly activeSelection?: ModelReference;
  readonly defaults?: ModelDefaults;
  readonly isNewSession: boolean;
  readonly recentModelKeys: readonly string[];
  readonly lastThinkingLevel?: string;
}

/** Resolves startup defaults without replacing explicit choices or applying them to resumed sessions. */
export function resolveComposerModelSelection({models, activeSelection, defaults, isNewSession, recentModelKeys, lastThinkingLevel}: ResolveComposerModelSelectionOptions) {
  const activeModel = activeSelection && models.find((model) => model.providerId === activeSelection.providerId && model.id === activeSelection.id);

  const startupDefaults = isNewSession ? defaults : undefined;
  const hasDefaultModel = startupDefaults?.providerId !== undefined || startupDefaults?.modelId !== undefined;
  const defaultModel = hasDefaultModel
    ? models.find(
        (model) =>
          (startupDefaults?.providerId === undefined || model.providerId === startupDefaults.providerId) &&
          (startupDefaults?.modelId === undefined || model.id === startupDefaults.modelId)
      )
    : undefined;

  const recentKey = recentModelKeys.find((key) => models.some((model) => modelKey(model.providerId, model.id) === key));
  const recentModel = recentKey ? models.find((model) => modelKey(model.providerId, model.id) === recentKey) : undefined;
  const selectedModelDetails = activeModel ?? defaultModel ?? recentModel ?? models[0];

  const modelThinkingLevel = selectedModelDetails ? startupDefaults?.modelThinkingLevels?.[`${selectedModelDetails.providerId}/${selectedModelDetails.id}`] : undefined;
  const preferredThinkingLevel = activeModel ? activeSelection?.thinkingLevel : (modelThinkingLevel ?? startupDefaults?.thinkingLevel ?? lastThinkingLevel);
  const thinkingLevel = selectedModelDetails ? resolveThinkingLevel(selectedModelDetails, preferredThinkingLevel) : undefined;

  return {
    selectedModelDetails,
    modelReference: selectedModelDetails ? createModelReference(selectedModelDetails, thinkingLevel) : undefined,
  };
}
