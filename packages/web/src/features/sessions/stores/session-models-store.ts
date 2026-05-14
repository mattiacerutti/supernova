import type {ModelReference} from "@pi-desktop/contracts/sessions/schemas";
import {create} from "zustand";
import {persist} from "zustand/middleware";

const SESSION_MODEL_SELECTION_STORAGE_KEY = "pi-desktop-session-model-selection";

interface SessionModelsState {
  readonly models: Record<string, ModelReference>;
  readonly getSessionModel: (sessionId: string) => ModelReference | undefined;
  readonly setSessionModel: (sessionId: string, selection: ModelReference) => void;
}

export const useSessionModelsStore = create<SessionModelsState>()(
  persist(
    (set, get) => ({
      models: {},
      getSessionModel: (sessionId) => (sessionId ? get().models[sessionId] : undefined),
      setSessionModel: (sessionId, selection) => {
        set((state) => ({models: {...state.models, [sessionId]: selection}}));
      },
    }),
    {
      name: SESSION_MODEL_SELECTION_STORAGE_KEY,
      partialize: (state) => ({selections: state.models}),
    }
  )
);
