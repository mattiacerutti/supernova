import {create} from "zustand";
import {persist} from "zustand/middleware";

const MODEL_PICKER_STORAGE_KEY = "pi-desktop-model-picker";
const MAX_RECENT_MODELS = 5;

interface IModelPickerState {
  readonly favoriteModelKeys: readonly string[];
  readonly recentModelKeys: readonly string[];
  readonly recordRecentModel: (modelKey: string) => void;
  readonly toggleFavoriteModel: (modelKey: string) => void;
}

interface IPersistedModelPickerState {
  readonly favoriteModelKeys?: unknown;
  readonly recentModelKeys?: unknown;
}

function sanitizeModelKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function migrateModelPickerState(state: unknown): IPersistedModelPickerState {
  if (typeof state !== "object" || state === null) {
    return {favoriteModelKeys: [], recentModelKeys: []};
  }

  const persistedState = state as IPersistedModelPickerState;

  return {
    favoriteModelKeys: sanitizeModelKeys(persistedState.favoriteModelKeys),
    recentModelKeys: sanitizeModelKeys(persistedState.recentModelKeys).slice(0, MAX_RECENT_MODELS),
  };
}

export const useModelPickerStore = create<IModelPickerState>()(
  persist(
    (set) => ({
      favoriteModelKeys: [],
      recentModelKeys: [],
      recordRecentModel: (modelKey) => {
        set((state) => ({
          recentModelKeys: [modelKey, ...state.recentModelKeys.filter((key) => key !== modelKey)].slice(0, MAX_RECENT_MODELS),
        }));
      },
      toggleFavoriteModel: (modelKey) => {
        set((state) => {
          const isFavorite = state.favoriteModelKeys.includes(modelKey);

          return {
            favoriteModelKeys: isFavorite ? state.favoriteModelKeys.filter((key) => key !== modelKey) : [modelKey, ...state.favoriteModelKeys],
          };
        });
      },
    }),
    {
      migrate: migrateModelPickerState,
      name: MODEL_PICKER_STORAGE_KEY,
      partialize: (state) => ({favoriteModelKeys: state.favoriteModelKeys, recentModelKeys: state.recentModelKeys}),
      version: 1,
    }
  )
);
