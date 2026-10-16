import type {SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import {sessionActivityOf} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/services/sessions/schemas";
import type {SessionDirectoryEntry} from "@supernova/contracts/services/sessions/services";
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
  readonly title: string | undefined;
  readonly pinned: boolean;
  readonly turns: readonly SessionTurn[];
  readonly undoneTurns: readonly SessionTurn[];
  readonly liveTurn: SessionTurn | undefined;
}

function statusOf(activity: SessionDirectoryEntry["activity"], optimism: SessionOptimism): SessionStatusKind {
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

function sessionSummary(listed: SessionSummary, entry: SessionDirectoryEntry | undefined, optimism: SessionOptimism = {}): SessionSummary {
  const summary = entry?.summary ?? listed;
  return {...summary, title: optimism.title ?? summary.title, pinned: optimism.pinned ?? summary.pinned};
}

function listingOrder(left: SessionSummary, right: SessionSummary): number {
  return Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

/** The document's `live` wins: the directory's activity replicates separately and can lag it by a frame. */
export function sessionStatus(entry: SessionDirectoryEntry | undefined, optimism: SessionOptimism = {}, session?: Pick<Session, "live">): SessionStatus {
  const activity = session ? sessionActivityOf(session.live) : (entry?.activity ?? "idle");
  return {
    status: statusOf(activity, optimism),
    // The step the client knows of shows until the runtime reports one or the run starts.
    setupStep: entry?.setupStep ?? (activity === "idle" ? (optimism.setupStep ?? null) : null),
    error: optimism.error ?? null,
  };
}

export function projectSessions(input: {
  readonly loaded: readonly SessionSummary[];
  readonly projectPath: string;
  readonly entries: Readonly<Record<string, SessionDirectoryEntry>>;
  readonly optimism: Readonly<Record<string, SessionOptimism>>;
}): SessionSummary[] {
  const {entries, loaded, optimism, projectPath} = input;
  const loadedIds = new Set(loaded.map((session) => session.id));
  const added = Object.values(entries).flatMap((entry) => (entry.projectPath === projectPath && entry.summary && !loadedIds.has(entry.summary.id) ? [entry.summary] : []));
  return [...added, ...loaded]
    .filter((summary) => !optimism[summary.id]?.archived)
    .map((summary) => sessionSummary(summary, entries[summary.id], optimism[summary.id]))
    .toSorted(listingOrder);
}

export function sessionView(input: {readonly session: Session | undefined; readonly entry: SessionDirectoryEntry | undefined; readonly optimism?: SessionOptimism}): SessionView {
  const {entry, optimism = {}, session} = input;
  const projected = session ? buildSessionTurns(session) : undefined;
  const undone = session && !optimism.message ? buildSessionTurns({entries: session.undone, live: {}}).turns : [];
  const shown = projected?.turns ?? [];
  const {turns, undoneTurns} = optimism.navigation ? navigated(shown, undone, optimism.navigation.lastTurnId) : {turns: shown, undoneTurns: undone};
  return {
    ...sessionStatus(entry, optimism, session),
    session,
    title: optimism.title ?? entry?.summary?.title ?? session?.title,
    pinned: optimism.pinned ?? entry?.summary?.pinned ?? session?.pinned ?? false,
    turns,
    undoneTurns,
    liveTurn: projected?.liveTurn ?? (optimism.message && pendingTurn(optimism.message)),
  };
}
