import {randomUUID} from "node:crypto";
import type {SessionActivity, SessionNotice, SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import type {SessionStatusEntry, SessionStatuses} from "@supernova/contracts/services/sessions/services";

/** Notices a session keeps; older ones roll off. Enough for every extension's load diagnostics and a few run failures. */
const NOTICE_LIMIT = 20;

const IDLE: SessionStatusEntry = {activity: "idle", setupStep: null, notices: []};

export type StatusChange =
  | {readonly kind: "activity"; readonly activity: SessionActivity}
  | {readonly kind: "setup"; readonly step: SessionSetupStep | null}
  | {readonly kind: "notice"; readonly notice: Omit<SessionNotice, "id" | "at">}
  | {readonly kind: "unavailable"};

/** An idle session with nothing to show leaves the map, so status never grows into a history of every session. */
export class SessionStatus {
  private readonly entries = new Map<string, SessionStatusEntry>();
  private readonly listeners = new Set<(sessionId: string, entry: SessionStatusEntry | undefined) => void>();

  public all(): SessionStatuses {
    return {sessions: Object.fromEntries(this.entries)};
  }

  public change(sessionId: string, change: StatusChange): void {
    const current = this.entries.get(sessionId) ?? IDLE;
    const next = changed(current, change);
    if (next === current) return;
    if (next.activity === "idle" && next.setupStep === null && next.notices.length === 0) {
      if (this.entries.delete(sessionId)) this.emit(sessionId, undefined);
      return;
    }
    this.entries.set(sessionId, next);
    this.emit(sessionId, next);
  }

  public forget(sessionId: string): void {
    if (this.entries.delete(sessionId)) this.emit(sessionId, undefined);
  }

  public onChange(listener: (sessionId: string, entry: SessionStatusEntry | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(sessionId: string, entry: SessionStatusEntry | undefined): void {
    for (const listener of [...this.listeners]) listener(sessionId, entry);
  }
}

function changed(current: SessionStatusEntry, change: StatusChange): SessionStatusEntry {
  switch (change.kind) {
    case "activity":
      // A run starting ends its setup.
      if (current.activity === change.activity) return current;
      return {...current, activity: change.activity, ...(change.activity === "running" ? {setupStep: null} : {})};
    case "setup":
      return current.setupStep === change.step ? current : {...current, setupStep: change.step};
    case "notice": {
      const notice = {...change.notice, id: randomUUID(), at: new Date().toISOString()};
      return {...current, notices: [...current.notices, notice].slice(-NOTICE_LIMIT)};
    }
    case "unavailable":
      return current.activity === "idle" && current.setupStep === null ? current : {...current, activity: "idle", setupStep: null};
  }
}
