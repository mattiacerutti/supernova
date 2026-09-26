import {create} from "zustand";
import {persist} from "zustand/middleware";

const SESSION_VISITS_STORAGE_KEY = "supernova-session-visits";

interface SessionVisitsState {
  /** Session id to ISO timestamp of the latest session activity the user has seen. */
  readonly visits: Record<string, string>;
  readonly markSessionVisited: (sessionId: string, visitedAt: string) => void;
}

/**
 * Tracks the latest activity each session had when the user last saw it, so
 * activity that lands while a session is closed can surface as unseen.
 * Stamps never move backwards: seeing one completion must not hide later
 * activity that was already recorded.
 */
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
  /** Latest session activity, in epoch milliseconds. */
  readonly activityAtMs: number;
  /** Activity timestamp recorded the last time the user saw the session. */
  readonly visitedAt: string | undefined;
}

/**
 * Whether a session has activity the user has not seen yet. Sessions the user
 * has never opened are not treated as unseen, otherwise every existing
 * session would be flagged the first time visits are recorded.
 */
export function hasUnseenActivity(input: UnseenActivityInput): boolean {
  const {activityAtMs, visitedAt} = input;
  if (visitedAt === undefined || Number.isNaN(activityAtMs)) return false;

  const visitedAtMs = Date.parse(visitedAt);
  return Number.isNaN(visitedAtMs) || activityAtMs > visitedAtMs;
}
