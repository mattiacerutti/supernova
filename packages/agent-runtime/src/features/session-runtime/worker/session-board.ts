import type {MutableReplicatedState} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {SessionDirectoryEntry, SessionDirectoryState} from "@supernova/contracts/services/sessions/services";

/**
 * Every session the server opened since it started, as clients that have not attached it see it: activity, summary,
 * a setup step, and the last problem. Changes are published as Chord deltas.
 */
export class SessionBoard {
  public readonly state: MutableReplicatedState<SessionDirectoryState> = replicatedState<SessionDirectoryState>({sessions: {}});

  /** Changes a session's entry, creating it under `projectPath`; publishes only when something changed. */
  public update(sessionId: string, projectPath: string, change: Partial<Omit<SessionDirectoryEntry, "projectPath">>): void {
    const previous = this.state.value.sessions[sessionId];
    const next: SessionDirectoryEntry = {activity: "idle", error: null, setupStep: null, summary: null, ...previous, ...change, projectPath};
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) return;
    this.state.change(BACKGROUND_CONTEXT, (draft) => {
      draft.sessions[sessionId] = next;
    });
  }

  /** Drops a session's entry, after it was archived. */
  public remove(sessionId: string): void {
    if (!this.state.value.sessions[sessionId]) return;
    this.state.change(BACKGROUND_CONTEXT, (draft) => {
      delete draft.sessions[sessionId];
    });
  }
}
