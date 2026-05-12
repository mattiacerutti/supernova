import type {AgentModelReference} from "@pi-desktop/contracts/sessions/schemas";
import {create} from "zustand";
import {persist} from "zustand/middleware";

const SESSION_MODEL_SELECTION_STORAGE_KEY = "pi-desktop-session-model-selection";

interface SessionModelsState {
  readonly models: Record<string, AgentModelReference>;
  readonly getSessionModel: (sessionId: string) => AgentModelReference | undefined;
  readonly setSessionModel: (sessionId: string, selection: AgentModelReference) => void;
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
