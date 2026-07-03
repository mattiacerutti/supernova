import type {ModelDetails, ModelReference} from "@supernova/contracts/sessions/schemas";
import {useState} from "react";
import {useSessionModels} from "@/features/sessions/hooks/api/use-session-models";
import {modelKey, resolveThinkingLevel, createModelReference} from "@/features/sessions/lib/composer/model-picker/model-utils";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {useSessionModelsStore} from "@/features/sessions/stores/session-models-store";

interface UseComposerModelSelectionInput {
  readonly initialSelection?: ModelReference;
  readonly sessionId?: string;
}

interface ComposerModelSelection {
  readonly availableModels: readonly ModelDetails[];
  readonly isPending: boolean;
  readonly selectedModel: ModelDetails | undefined;
  readonly selectedThinkingLabel: string;
  readonly modelReference: ModelReference | undefined;
  readonly assignToSession: (sessionId: string) => void;
  readonly findModel: (key: string) => ModelDetails | undefined;
  readonly rememberSelection: () => void;
  readonly selectModel: (key: string) => void;
  readonly selectThinkingLevel: (value: string) => void;
}

function findModelByKey(models: readonly ModelDetails[], key: string): ModelDetails | undefined {
  return models.find((model) => modelKey(model.providerId, model.id) === key);
}

function modelFromReference(models: readonly ModelDetails[], reference: ModelReference | undefined): ModelDetails | undefined {
  if (!reference) return undefined;

  return models.find((model) => model.providerId === reference.providerId && model.id === reference.id);
}

function recentModel(models: readonly ModelDetails[], recentKeys: readonly string[]): ModelDetails | undefined {
  const key = recentKeys.find((recentKey) => findModelByKey(models, recentKey));
  return key ? findModelByKey(models, key) : undefined;
}

/** Owns model and thinking-level selection for session composers. */
export function useComposerModelSelection(input: UseComposerModelSelectionInput = {}): ComposerModelSelection {
  const {initialSelection, sessionId} = input;

  const {data: models, isPending} = useSessionModels();
  const availableModels = models ?? [];

  const [localSelection, setLocalSelection] = useState<ModelReference | undefined>(undefined);
  const storedSessionSelection = useSessionModelsStore((state) => (sessionId ? state.models[sessionId] : undefined));
  const setSessionModel = useSessionModelsStore((state) => state.setSessionModel);
  const recordRecentModel = useModelPickerStore((state) => state.recordRecentModel);
  const recentModelKeys = useModelPickerStore((state) => state.recentModelKeys);
  const lastThinkingLevel = useModelPickerStore((state) => state.lastThinkingLevel);
  const setLastThinkingLevel = useModelPickerStore((state) => state.setLastThinkingLevel);

  // Determine the active selection based on session ID, stored selection, and local selection
  const activeSelection = sessionId ? (storedSessionSelection ?? initialSelection) : localSelection;
  const activeSelectionModel = modelFromReference(availableModels, activeSelection);

  // Final selected model is active selection model if available, otherwise the most recent model, or the first available model
  const selectedModel = activeSelectionModel ?? recentModel(availableModels, recentModelKeys) ?? availableModels[0];

  // If we have an active selection, we use that selection thinking level, otherwise we fallback
  // to the last thinking level used (which is normalized in case the model does not support it)
  const preferredThinkingLevel = activeSelectionModel ? activeSelection?.thinkingLevel : lastThinkingLevel;
  const resolvedThinkingLevel = selectedModel ? resolveThinkingLevel(selectedModel, preferredThinkingLevel) : undefined;

  const modelReference = selectedModel ? createModelReference(selectedModel, resolvedThinkingLevel) : undefined;
  const selectedThinkingLabel = selectedModel?.thinkingLevels.find((level) => level.value === modelReference?.thinkingLevel)?.label ?? "Reasoning";

  const saveSelection = (selection: ModelReference): void => {
    if (sessionId) {
      setSessionModel(sessionId, selection);
      return;
    }

    setLocalSelection(selection);
  };

  const findModel = (key: string): ModelDetails | undefined => findModelByKey(availableModels, key);

  const selectModel = (key: string): void => {
    const nextModel = findModel(key);
    if (!nextModel) return;

    saveSelection(createModelReference(nextModel, resolveThinkingLevel(nextModel, modelReference?.thinkingLevel ?? lastThinkingLevel)));
    recordRecentModel(key);
  };

  const selectThinkingLevel = (value: string): void => {
    if (!selectedModel) return;

    saveSelection(createModelReference(selectedModel, value));
    setLastThinkingLevel(value);
  };

  const rememberSelection = (): void => {
    if (modelReference) recordRecentModel(modelKey(modelReference.providerId, modelReference.id));
    setLastThinkingLevel(modelReference?.thinkingLevel);
  };

  const assignToSession = (nextSessionId: string): void => {
    if (modelReference) setSessionModel(nextSessionId, modelReference);
  };

  return {
    assignToSession,
    availableModels,
    findModel,
    isPending,
    modelReference,
    rememberSelection,
    selectModel,
    selectThinkingLevel,
    selectedModel,
    selectedThinkingLabel,
  };
}
