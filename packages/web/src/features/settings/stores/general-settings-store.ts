import {create} from "zustand";
import {persist} from "zustand/middleware";

const GENERAL_SETTINGS_STORAGE_KEY = "supernova-general-settings";

interface GeneralSettingsState {
  readonly captureCheckpoints: boolean;
  readonly confirmCheckpointConflicts: boolean;
  readonly setCaptureCheckpoints: (enabled: boolean) => void;
  readonly setConfirmCheckpointConflicts: (enabled: boolean) => void;
}

/** General settings, persisted per browser. */
export const useGeneralSettingsStore = create<GeneralSettingsState>()(
  persist(
    (set) => ({
      captureCheckpoints: true,
      confirmCheckpointConflicts: true,
      setCaptureCheckpoints: (captureCheckpoints) => set({captureCheckpoints}),
      setConfirmCheckpointConflicts: (confirmCheckpointConflicts) => set({confirmCheckpointConflicts}),
    }),
    {
      name: GENERAL_SETTINGS_STORAGE_KEY,
      partialize: (state) => ({
        captureCheckpoints: state.captureCheckpoints,
        confirmCheckpointConflicts: state.confirmCheckpointConflicts,
      }),
    }
  )
);
