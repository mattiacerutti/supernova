import type {SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import {sessionActivityOf} from "@supernova/contracts/services/sessions/procedures";
import type {ListedSession, SessionStatusEntry} from "@supernova/contracts/services/sessions/services";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {buildSessionTurns} from "@/features/sessions/lib/timeline/turns/build-turns";
import type {PendingMessage, SessionOptimism} from "@/features/sessions/stores/sessions-store";
import type {SessionTurn} from "@/features/sessions/types/session-turn";

export type SessionStatusKind = "checkpoint-navigating" | "compacting" | "idle" | "stopping" | "streaming";

export interface SessionStatus {
  readonly status: SessionStatusKind;
  readonly setupStep: SessionSetupStep | null;
  readonly error: string | null;
}

export interface SessionView extends SessionStatus {
  readonly session: Session | undefined;
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
  // A target the document no longer has leaves the timeline as the runtime shows it.
  if (lastTurnId !== null && shown === 0) return {turns, undoneTurns};
  return {turns: all.slice(0, shown), undoneTurns: all.slice(shown)};
}

function listingOrder(left: ListedSession, right: ListedSession): number {
  return Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

/** The document's `live` wins: status replicates separately and can lag it by a frame. */
export function sessionStatus(entry: SessionStatusEntry | undefined, optimism: SessionOptimism = {}, session?: Pick<Session, "live">): SessionStatus {
  const activity = session ? sessionActivityOf(session.live) : (entry?.activity ?? "idle");
  return {
    status: statusOf(activity, optimism),
    // The step the client knows of shows until the runtime reports one or the run starts.
    setupStep: entry?.setupStep ?? (activity === "idle" ? (optimism.setupStep ?? null) : null),
    error: optimism.error ?? null,
  };
}

/** A session this client is starting shows until the listing has it. */
export function listedSessions(input: {
  readonly items: readonly ListedSession[];
  readonly projectPath: string;
  readonly starting: readonly ListedSession[];
  readonly optimism: Readonly<Record<string, SessionOptimism>>;
}): ListedSession[] {
  const {items, optimism, projectPath, starting} = input;
  const listed = new Set(items.map((session) => session.id));
  const added = starting.filter((session) => !listed.has(session.id) && session.projectPath === projectPath && optimism[session.id]?.message !== undefined);
  return [...added, ...items]
    .filter((session) => !optimism[session.id]?.archived)
    .map((session) => ({...session, title: optimism[session.id]?.title ?? session.title, pinned: optimism[session.id]?.pinned ?? session.pinned}))
    .toSorted(listingOrder);
}

export function sessionView(input: {
  readonly session: Session | undefined;
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
