import {create} from "zustand";
import {persist} from "zustand/middleware";

const SESSION_PINS_STORAGE_KEY = "supernova-session-pins";
const LEGACY_PROJECTS_STORAGE_KEY = "supernova-projects";

interface SessionPinsState {
  readonly pinnedSessionIds: readonly string[];
  readonly toggleSessionPinned: (sessionId: string) => void;
}

/** Pins used to live on each project as `pinnedSessionIds`. Read them once so existing users keep theirs. */
function legacyPinnedSessionIds(): readonly string[] {
  try {
    const raw = localStorage.getItem(LEGACY_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const projects: readonly {pinnedSessionIds?: readonly string[]}[] = JSON.parse(raw).state?.projects ?? [];
    return projects.flatMap((project) => project.pinnedSessionIds ?? []);
  } catch {
    return [];
  }
}

export const useSessionPinsStore = create<SessionPinsState>()(
  persist(
    (set) => ({
      pinnedSessionIds: [],
      toggleSessionPinned: (sessionId) => {
        set((state) => ({
          pinnedSessionIds: state.pinnedSessionIds.includes(sessionId) ? state.pinnedSessionIds.filter((id) => id !== sessionId) : [...state.pinnedSessionIds, sessionId],
        }));
      },
    }),
    {
      name: SESSION_PINS_STORAGE_KEY,
      merge: (persisted, current) => ({...current, pinnedSessionIds: (persisted as Partial<SessionPinsState> | undefined)?.pinnedSessionIds ?? legacyPinnedSessionIds()}),
      partialize: (state) => ({pinnedSessionIds: state.pinnedSessionIds}),
    }
  )
);
