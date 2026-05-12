import {create} from "zustand";
import {persist} from "zustand/middleware";

const MODEL_PICKER_STORAGE_KEY = "pi-desktop-model-picker";
const MAX_RECENT_MODELS = 5;

interface ModelPickerState {
  readonly favoriteModelKeys: readonly string[];
  readonly recentModelKeys: readonly string[];
  readonly lastThinkingLevel: string | undefined;
  readonly recordRecentModel: (modelKey: string) => void;
  readonly setLastThinkingLevel: (value: string | undefined) => void;
  readonly toggleFavoriteModel: (modelKey: string) => void;
}

export const useModelPickerStore = create<ModelPickerState>()(
  persist(
    (set) => ({
      favoriteModelKeys: [],
      recentModelKeys: [],
      lastThinkingLevel: undefined,
      recordRecentModel: (modelKey) => {
        set((state) => ({
          recentModelKeys: [modelKey, ...state.recentModelKeys.filter((key) => key !== modelKey)].slice(0, MAX_RECENT_MODELS),
        }));
      },
      setLastThinkingLevel: (value) => {
        set({lastThinkingLevel: value});
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
      name: MODEL_PICKER_STORAGE_KEY,
      partialize: (state) => ({
        favoriteModelKeys: state.favoriteModelKeys,
        recentModelKeys: state.recentModelKeys,
        lastThinkingLevel: state.lastThinkingLevel,
      }),
    }
  )
);
