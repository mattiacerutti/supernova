import type {IAgentModelReference} from "@pi-desktop/contracts/sessions";
import {create} from "zustand";
import {persist} from "zustand/middleware";

const SESSION_MODEL_SELECTION_STORAGE_KEY = "pi-desktop-session-model-selection";

type SessionModelSelections = Record<string, IAgentModelReference | undefined>;

interface ISessionModelSelectionState {
  readonly getSelection: (sessionId: string | undefined) => IAgentModelReference | undefined;
  readonly selections: SessionModelSelections;
  readonly setSelection: (sessionId: string, selection: IAgentModelReference) => void;
}

interface IPersistedSessionModelSelectionState {
  readonly selections?: unknown;
}

function isModelSelection(value: unknown): value is IAgentModelReference {
  if (typeof value !== "object" || value === null) return false;
  const selection = value as Record<string, unknown>;
  return typeof selection.id === "string" && typeof selection.providerId === "string";
}

function migrateSessionModelSelectionState(state: unknown): IPersistedSessionModelSelectionState {
  if (typeof state !== "object" || state === null) return {selections: {}};

  const selections = (state as IPersistedSessionModelSelectionState).selections;
  if (typeof selections !== "object" || selections === null) return {selections: {}};

  return {
    selections: Object.fromEntries(Object.entries(selections).filter((entry): entry is [string, IAgentModelReference] => isModelSelection(entry[1]))),
  };
}

export const useSessionModelSelectionStore = create<ISessionModelSelectionState>()(
  persist(
    (set, get) => ({
      getSelection: (sessionId) => (sessionId ? get().selections[sessionId] : undefined),
      selections: {},
      setSelection: (sessionId, selection) => {
        set((state) => ({selections: {...state.selections, [sessionId]: selection}}));
      },
    }),
    {
      migrate: migrateSessionModelSelectionState,
      name: SESSION_MODEL_SELECTION_STORAGE_KEY,
      partialize: (state) => ({selections: state.selections}),
      version: 1,
    }
  )
);
