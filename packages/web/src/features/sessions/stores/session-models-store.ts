import type {IAgentModelReference} from "@pi-desktop/contracts/sessions";
import {create} from "zustand";
import {persist} from "zustand/middleware";

const SESSION_MODEL_SELECTION_STORAGE_KEY = "pi-desktop-session-model-selection";

interface ISessionModelsState {
  readonly models: Record<string, IAgentModelReference>;
  readonly getSessionModel: (sessionId: string) => IAgentModelReference | undefined;
  readonly setSessionModel: (sessionId: string, selection: IAgentModelReference) => void;
}

export const useSessionModelsStore = create<ISessionModelsState>()(
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
