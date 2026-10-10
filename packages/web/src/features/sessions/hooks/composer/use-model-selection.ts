import type {ModelDetails, ModelReference} from "@supernova/contracts/services/sessions/schemas";
import type {ModelDefaults} from "@supernova/contracts/services/configuration/schemas";
import {resolveComposerModelSelection} from "@/features/sessions/lib/composer/models/model-defaults";
import {useSessionModels} from "@/features/sessions/api/composer/list-session-models";
import {modelKey, resolveThinkingLevel, createModelReference} from "@/features/sessions/lib/composer/models/model-reference";
import {useModelPickerStore} from "@/features/sessions/stores/composer/model-picker-store";
import {useSessionModelsStore} from "@/features/sessions/stores/composer/session-models-store";

interface UseModelSelectionOptions {
  readonly projectPath: string;
  /** Project defaults for a session that has not been sent yet. Omit for an existing session, whose own model wins. */
  readonly defaults?: ModelDefaults;
  readonly initialSelection?: ModelReference;
  readonly sessionId: string;
}

export interface ModelSelection {
  readonly availableModels: readonly ModelDetails[];
  readonly isPending: boolean;
  readonly selectedModelDetails: ModelDetails | undefined;
  readonly selectedThinkingLabel: string;
  readonly modelReference: ModelReference | undefined;
  readonly findModel: (key: string) => ModelDetails | undefined;
  readonly selectModel: (key: string) => void;
  readonly selectThinkingLevel: (value: string) => void;
}

/** Owns model and thinking-level selection for one composer, persisted per session id. */
export function useModelSelection(options: UseModelSelectionOptions): ModelSelection {
  const {defaults, initialSelection, projectPath, sessionId} = options;

  const {data: models, isPending} = useSessionModels(projectPath);
  const availableModels = models ?? [];

  const storedSessionSelection = useSessionModelsStore((state) => state.models[sessionId]);
  const setSessionModel = useSessionModelsStore((state) => state.setSessionModel);
  const recordRecentModel = useModelPickerStore((state) => state.recordRecentModel);
  const recentModelKeys = useModelPickerStore((state) => state.recentModelKeys);
  const lastThinkingLevel = useModelPickerStore((state) => state.lastThinkingLevel);
  const recordRecentThinkingLevel = useModelPickerStore((state) => state.recordRecentThinkingLevel);

  const activeSelection = storedSessionSelection ?? initialSelection;
  const {selectedModelDetails, modelReference} = resolveComposerModelSelection({
    models: availableModels,
    activeSelection,
    defaults,
    isNewSession: defaults !== undefined,
    recentModelKeys,
    lastThinkingLevel,
  });
  const selectedThinkingLabel = selectedModelDetails?.thinkingLevels.find((level) => level.value === modelReference?.thinkingLevel)?.label ?? "Reasoning";

  const findModel = (key: string): ModelDetails | undefined => availableModels.find((model) => modelKey(model.providerId, model.id) === key);

  const selectModel = (key: string): void => {
    const nextModel = findModel(key);
    if (!nextModel) return;

    const thinkingLevel = resolveThinkingLevel(nextModel, modelReference?.thinkingLevel ?? lastThinkingLevel);
    const reference = createModelReference(nextModel, thinkingLevel);

    setSessionModel(sessionId, reference);
    recordRecentModel(key);
  };

  const selectThinkingLevel = (value: string): void => {
    if (!selectedModelDetails) return;

    setSessionModel(sessionId, createModelReference(selectedModelDetails, value));
    recordRecentThinkingLevel(value);
  };

  return {
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
