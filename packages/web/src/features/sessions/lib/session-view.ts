import type {SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import {sessionActivityOf} from "@supernova/contracts/services/sessions/procedures";
import type {ListedSession, SessionsView, SessionStatusEntry} from "@supernova/contracts/services/sessions/services";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";
import {buildSessionTurns} from "@/features/sessions/lib/timeline/turns/build-turns";
import type {PendingMessage, SessionOptimism} from "@/features/sessions/stores/session-optimism-store";
import type {SessionTurn} from "@/features/sessions/types/session-turn";

export type SessionStatusKind = "checkpoint-navigating" | "compacting" | "idle" | "stopping" | "streaming";

export interface SessionStatus {
  readonly status: SessionStatusKind;
  readonly setupStep: SessionSetupStep | null;
  readonly error: string | null;
}

export interface SessionView extends SessionStatus {
  readonly session: ChatDocument | undefined;
  readonly record: ListedSession | undefined;
  readonly title: string | undefined;
  readonly pinned: boolean;
  readonly turns: readonly SessionTurn[];
  readonly undoneTurns: readonly SessionTurn[];
  readonly liveTurn: SessionTurn | undefined;
}

function statusOf(activity: SessionStatusEntry["activity"], optimism: SessionOptimism): SessionStatusKind {
  if (optimism.navigation) return "checkpoint-navigating";
  if (optimism.stopping) return "stopping";
  if (optimism.compacting || activity === "compacting") return "compacting";
  if (optimism.message || activity === "running") return "streaming";
  return "idle";
}

function pendingTurn(pending: PendingMessage): SessionTurn {
  const userMessage = {contentParts: pending.contentParts, id: pending.id, timestamp: pending.timestamp};
  return {completedAt: undefined, events: [], id: pending.id, startedAt: pending.timestamp, status: "streaming", userMessage};
}

function navigated(turns: readonly SessionTurn[], undoneTurns: readonly SessionTurn[], lastTurnId: string | null) {
  const all = [...turns, ...undoneTurns];
  const shown = lastTurnId === null ? 0 : all.findIndex((turn) => turn.id === lastTurnId) + 1;
  if (lastTurnId !== null && shown === 0) return {turns, undoneTurns};
  return {turns: all.slice(0, shown), undoneTurns: all.slice(shown)};
}

export function sessionStatus(entry: SessionStatusEntry | undefined, optimism: SessionOptimism = {}, session?: Pick<ChatDocument, "live">): SessionStatus {
  // The document's `live` wins: status can lag it by a frame.
  const activity = session ? sessionActivityOf(session.live) : (entry?.activity ?? "idle");
  return {
    status: statusOf(activity, optimism),
    // Until the runtime reports a step or the run starts.
    setupStep: entry?.setupStep ?? (activity === "idle" ? (optimism.setupStep ?? null) : null),
    error: optimism.error ?? null,
  };
}

// The tab's view has the open session's record and every one its project lists show.
export function recordIn(view: SessionsView | undefined, sessionId: string): ListedSession | undefined {
  if (view?.open?.id === sessionId) return view.open;
  for (const project of Object.values(view?.projects ?? {})) {
    const record = project.items.find((item) => item.id === sessionId);
    if (record) return record;
  }
  return undefined;
}

export function listedSessions(input: {
  readonly items: readonly ListedSession[];
  readonly projectPath: string;
  readonly optimism: Readonly<Record<string, SessionOptimism>>;
}): ListedSession[] {
  const {items, optimism, projectPath} = input;
  const listed = new Set(items.map((session) => session.id));
  const added = Object.values(optimism).flatMap(({created, message}) => (created && message && !listed.has(created.id) && created.projectPath === projectPath ? [created] : []));
  return (
    [...added, ...items]
      .filter((session) => !optimism[session.id]?.archived)
      .map((session) => ({...session, title: optimism[session.id]?.title ?? session.title, pinned: optimism[session.id]?.pinned ?? session.pinned}))
      // Preserve the server's running-turn order within each optimistic pin group.
      .toSorted((left, right) => Number(right.pinned) - Number(left.pinned))
  );
}

export function sessionView(input: {
  readonly session: ChatDocument | undefined;
  readonly record: ListedSession | undefined;
  readonly entry: SessionStatusEntry | undefined;
  readonly optimism?: SessionOptimism;
}): SessionView {
  const {entry, optimism = {}, record, session} = input;
  const projected = session ? buildSessionTurns(session) : undefined;
  const undone = session && !optimism.message ? buildSessionTurns({entries: session.undone, live: {}}).turns : [];
  const shown = projected?.turns ?? [];
  const {turns, undoneTurns} = optimism.navigation ? navigated(shown, undone, optimism.navigation.lastTurnId) : {turns: shown, undoneTurns: undone};
  return {
    ...sessionStatus(entry, optimism, session),
    session,
    record,
    title: optimism.title ?? record?.title,
    pinned: optimism.pinned ?? record?.pinned ?? false,
    turns,
    undoneTurns,
    liveTurn: projected?.liveTurn ?? (optimism.message && pendingTurn(optimism.message)),
  };
}
