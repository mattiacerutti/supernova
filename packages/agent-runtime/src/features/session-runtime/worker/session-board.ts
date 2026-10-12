import type {MutableReplicatedState} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {randomUUID} from "node:crypto";
import type {SessionNotice} from "@supernova/contracts/services/session-runtime/procedures";
import type {SessionDirectoryEntry, SessionDirectoryState} from "@supernova/contracts/services/sessions/services";

/** Notices a session keeps; older ones roll off. Enough for every extension's load diagnostics and a few run failures. */
const NOTICE_LIMIT = 20;

/**
 * Every session the server opened since it started, as clients that have not attached it see it: activity, summary,
 * a setup step, and its notices. Changes are published as Chord deltas.
 */
export class SessionBoard {
  public readonly state: MutableReplicatedState<SessionDirectoryState> = replicatedState<SessionDirectoryState>({sessions: {}});

  /** Changes a session's entry, creating it under `projectPath`; publishes only when something changed. */
  public update(sessionId: string, projectPath: string, change: Partial<Omit<SessionDirectoryEntry, "projectPath">>): void {
    const previous = this.state.value.sessions[sessionId];
    const next: SessionDirectoryEntry = {activity: "idle", notices: [], setupStep: null, summary: null, ...previous, ...change, projectPath};
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) return;
    this.state.change(BACKGROUND_CONTEXT, (draft) => {
      draft.sessions[sessionId] = next;
    });
  }

  /** Adds a notice to a session's entry, creating it under `projectPath`. */
  public notify(sessionId: string, projectPath: string, notice: Omit<SessionNotice, "id" | "at">): void {
    const notices = this.state.value.sessions[sessionId]?.notices ?? [];
    this.update(sessionId, projectPath, {notices: [...notices, {...notice, id: randomUUID(), at: new Date().toISOString()}].slice(-NOTICE_LIMIT)});
  }

  /** Drops a session's entry, after it was archived. */
  public remove(sessionId: string): void {
    if (!this.state.value.sessions[sessionId]) return;
    this.state.change(BACKGROUND_CONTEXT, (draft) => {
      delete draft.sessions[sessionId];
    });
  }
}
