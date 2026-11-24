import {randomUUID} from "node:crypto";
import type {SessionActivity, SessionNotice, SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import type {SessionStatusEntry, SessionStatuses} from "@supernova/contracts/services/sessions/services";
import type {Published} from "@supernova/agent-runtime/lib/chord/state";

const NOTICE_LIMIT = 20;

const IDLE: SessionStatusEntry = {activity: "idle", setupStep: null, notices: []};

export type StatusChange =
  | {readonly kind: "activity"; readonly activity: SessionActivity; readonly at?: string}
  | {readonly kind: "setup"; readonly step: SessionSetupStep | null}
  | {readonly kind: "notice"; readonly notice: Omit<SessionNotice, "id" | "at">}
  | {readonly kind: "unavailable"};

export class SessionStatus {
  private readonly statuses: Published<SessionStatuses>;

  public constructor(statuses: Published<SessionStatuses>) {
    this.statuses = statuses;
  }

  public change(sessionId: string, change: StatusChange): void {
    const current = this.statuses.value.sessions[sessionId] ?? IDLE;
    const next = changed(current, change);
    if (next === current) return;

    if (next.activity === "idle" && next.setupStep === null && next.notices.length === 0) {
      this.forget(sessionId);
      return;
    }

    this.statuses.set({sessions: {...this.statuses.value.sessions, [sessionId]: next}});
  }

  public forget(sessionId: string): void {
    if (!(sessionId in this.statuses.value.sessions)) return;

    const sessions = {...this.statuses.value.sessions};
    delete sessions[sessionId];
    this.statuses.set({sessions});
  }
}

function changed(current: SessionStatusEntry, change: StatusChange): SessionStatusEntry {
  switch (change.kind) {
    case "activity": {
      const activeTurnSentAt = change.activity === "idle" ? undefined : change.at;
      if (current.activity === change.activity && current.activeTurnSentAt === activeTurnSentAt) return current;
      const next = {...current, activity: change.activity, ...(change.activity === "running" ? {setupStep: null} : {})};
      if (activeTurnSentAt === undefined) delete next.activeTurnSentAt;
      else next.activeTurnSentAt = activeTurnSentAt;
      return next;
    }
    case "setup":
      return current.setupStep === change.step ? current : {...current, setupStep: change.step};
    case "notice": {
      const notice = {...change.notice, id: randomUUID(), at: new Date().toISOString()};
      return {...current, notices: [...current.notices, notice].slice(-NOTICE_LIMIT)};
    }
    case "unavailable":
      return current.activity === "idle" && current.setupStep === null ? current : {...IDLE, notices: current.notices};
  }
}
