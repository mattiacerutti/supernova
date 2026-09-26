import type {ModelDetails, ModelReference} from "@supernova/contracts/sessions/schemas";
import type {ModelDefaults} from "@supernova/contracts/configuration/schemas";
import {resolveComposerModelSelection} from "@/features/sessions/lib/composer/models/model-defaults";
import {useState} from "react";
import {useSessionModels} from "@/features/sessions/api/composer/list-session-models";
import {modelKey, resolveThinkingLevel, createModelReference} from "@/features/sessions/lib/composer/models/model-reference";
import {useModelPickerStore} from "@/features/sessions/stores/composer/model-picker-store";
import {useSessionModelsStore} from "@/features/sessions/stores/composer/session-models-store";

interface UseModelSelectionOptions {
  readonly projectPath: string;
  readonly defaults?: ModelDefaults;
  readonly initialSelection?: ModelReference;
  readonly sessionId?: string;
}

export interface ModelSelection {
  readonly availableModels: readonly ModelDetails[];
  readonly isPending: boolean;
  readonly selectedModelDetails: ModelDetails | undefined;
  readonly selectedThinkingLabel: string;
  readonly modelReference: ModelReference | undefined;
  readonly assignToSession: (sessionId: string, selection: ModelReference) => void;
  readonly findModel: (key: string) => ModelDetails | undefined;
  readonly selectModel: (key: string) => void;
  readonly selectThinkingLevel: (value: string) => void;
}

/** Owns model and thinking-level selection for one composer. New sessions keep it local; existing sessions persist it per session. */
export function useModelSelection(options: UseModelSelectionOptions): ModelSelection {
  const {defaults, initialSelection, projectPath, sessionId} = options;

  const {data: models, isPending} = useSessionModels(projectPath);
  const availableModels = models ?? [];

  const [localSelection, setLocalSelection] = useState<ModelReference | undefined>(undefined);

  const storedSessionSelection = useSessionModelsStore((state) => (sessionId ? state.models[sessionId] : undefined));
  const setSessionModel = useSessionModelsStore((state) => state.setSessionModel);
  const recordRecentModel = useModelPickerStore((state) => state.recordRecentModel);
  const recentModelKeys = useModelPickerStore((state) => state.recentModelKeys);
  const lastThinkingLevel = useModelPickerStore((state) => state.lastThinkingLevel);
  const recordRecentThinkingLevel = useModelPickerStore((state) => state.recordRecentThinkingLevel);

  const activeSelection = sessionId ? (storedSessionSelection ?? initialSelection) : localSelection;
  const {selectedModelDetails, modelReference} = resolveComposerModelSelection({
    models: availableModels,
    activeSelection,
    defaults,
    isNewSession: !sessionId,
    recentModelKeys,
    lastThinkingLevel,
  });
  const selectedThinkingLabel = selectedModelDetails?.thinkingLevels.find((level) => level.value === modelReference?.thinkingLevel)?.label ?? "Reasoning";

  const saveSelection = (selection: ModelReference): void => {
    if (sessionId) {
      setSessionModel(sessionId, selection);
      return;
    }

    setLocalSelection(selection);
  };

  const findModel = (key: string): ModelDetails | undefined => availableModels.find((model) => modelKey(model.providerId, model.id) === key);

  const selectModel = (key: string): void => {
    const nextModel = findModel(key);
    if (!nextModel) return;

    const thinkingLevel = resolveThinkingLevel(nextModel, modelReference?.thinkingLevel ?? lastThinkingLevel);
    const reference = createModelReference(nextModel, thinkingLevel);

    saveSelection(reference);
    recordRecentModel(key);
  };

  const selectThinkingLevel = (value: string): void => {
    if (!selectedModelDetails) return;

    saveSelection(createModelReference(selectedModelDetails, value));
    recordRecentThinkingLevel(value);
  };

  const assignToSession = (nextSessionId: string, selection: ModelReference): void => {
    setSessionModel(nextSessionId, selection);

    recordRecentModel(modelKey(selection.providerId, selection.id));
    recordRecentThinkingLevel(selection.thinkingLevel);
  };

  return {
    assignToSession,
    availableModels,
    findModel,
    isPending,
    modelReference,
    selectModel,
    selectThinkingLevel,
    selectedModelDetails,
    selectedThinkingLabel,
  };
}
