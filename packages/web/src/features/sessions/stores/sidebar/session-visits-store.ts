import {create} from "zustand";
import {persist} from "zustand/middleware";

const SESSION_VISITS_STORAGE_KEY = "supernova-session-visits";

interface SessionVisitsState {
  readonly visits: Record<string, string>;
  readonly markSessionVisited: (sessionId: string, visitedAt: string) => void;
}

/** Stamps never move backwards: seeing one completion must not hide later activity already recorded. */
export const useSessionVisitsStore = create<SessionVisitsState>()(
  persist(
    (set) => ({
      visits: {},
      markSessionVisited: (sessionId, visitedAt) => {
        set((state) => {
          const visitedAtMs = Date.parse(visitedAt);
          if (Number.isNaN(visitedAtMs)) return state;

          const current = state.visits[sessionId];
          if (current !== undefined && visitedAtMs <= Date.parse(current)) return state;
          return {visits: {...state.visits, [sessionId]: visitedAt}};
        });
      },
    }),
    {name: SESSION_VISITS_STORAGE_KEY, partialize: (state) => ({visits: state.visits})}
  )
);

interface UnseenActivityInput {
  readonly activityAtMs: number;
  readonly visitedAt: string | undefined;
}

/** Never-opened sessions are not unseen, or every existing session would be flagged on first run. */
export function hasUnseenActivity(input: UnseenActivityInput): boolean {
  const {activityAtMs, visitedAt} = input;
  if (visitedAt === undefined || Number.isNaN(activityAtMs)) return false;

  const visitedAtMs = Date.parse(visitedAt);
  return Number.isNaN(visitedAtMs) || activityAtMs > visitedAtMs;
}
