import type {SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session, SessionSummary} from "@supernova/contracts/services/sessions/schemas";
import type {SessionDirectoryEntry} from "@supernova/contracts/services/sessions/services";
import {buildSessionTurns} from "@/features/sessions/lib/timeline/turns/build-turns";
import type {PendingMessage, SessionOptimism} from "@/features/sessions/stores/sessions-store";
import type {SessionTurn} from "@/features/sessions/types/session-turn";

/** What a session is doing as the UI shows it. The runtime reports idle, running, or compacting; the rest is the user's. */
export type SessionStatusKind = "checkpoint-navigating" | "compacting" | "idle" | "stopping" | "streaming";

/** What a session is doing as the UI shows it: the runtime's report with the user's optimism applied. */
export interface SessionStatus {
  readonly status: SessionStatusKind;
  /** Setup step running before a new session's first turn, shown in place of the thinking label. */
  readonly setupStep: SessionSetupStep | null;
  readonly error: string | null;
}

/** What a session's page shows: its document, if known, and its status, with the user's optimism applied to both. */
export interface SessionView extends SessionStatus {
  readonly session: Session | undefined;
  readonly title: string | undefined;
  /** Visible turns, moved by an undo, redo, or revert the runtime has not confirmed. */
  readonly turns: readonly SessionTurn[];
  readonly undoneTurns: readonly SessionTurn[];
  /** The turn being answered: the runtime's, or the user's sent message until the runtime shows it. */
  readonly liveTurn: SessionTurn | undefined;
}

function statusOf(activity: SessionDirectoryEntry["activity"], optimism: SessionOptimism): SessionStatusKind {
  if (optimism.navigation) return "checkpoint-navigating";
  if (optimism.stopping) return "stopping";
  if (optimism.compacting || activity === "compacting") return "compacting";
  if (optimism.message || activity === "running") return "streaming";
  return "idle";
}

/** A message sent but not in the session's document yet, as the start of the live turn. */
function pendingTurn(pending: PendingMessage): SessionTurn {
  const userMessage = {contentParts: pending.contentParts, id: pending.id, timestamp: pending.timestamp};
  return {completedAt: undefined, events: [], id: pending.id, startedAt: pending.timestamp, status: "streaming", userMessage};
}

/** Moves turns between visible and undone so `turnId` is where an unconfirmed undo, redo, or revert takes the timeline. */
function navigated(turns: readonly SessionTurn[], undoneTurns: readonly SessionTurn[], turnId: string | undefined) {
  const undoneIndex = undoneTurns.findIndex((turn) => turn.id === turnId);
  if (undoneIndex >= 0) return {turns: [...turns, ...undoneTurns.slice(0, undoneIndex + 1)], undoneTurns: undoneTurns.slice(undoneIndex + 1)};
  const turnIndex = turns.findIndex((turn) => turn.id === turnId);
  if (turnIndex >= 0) return {turns: turns.slice(0, turnIndex), undoneTurns: [...turns.slice(turnIndex), ...undoneTurns]};
  return {turns, undoneTurns};
}

/** What a session is doing as the UI shows it; for a sidebar row or a command's idle check. */
export function sessionStatus(entry: SessionDirectoryEntry | undefined, optimism: SessionOptimism = {}): SessionStatus {
  const activity = entry?.activity ?? "idle";
  const serverError = entry?.error && entry.error.at !== optimism.seenErrorAt ? entry.error.message : null;
  return {
    status: statusOf(activity, optimism),
    // The step the client knows of shows until the runtime reports one or the run starts.
    setupStep: entry?.setupStep ?? (activity === "idle" ? (optimism.setupStep ?? null) : null),
    error: optimism.error ?? serverError,
  };
}

/**
 * A project's sessions as the sidebar lists them: the fetched listing, with the runtime's newest summary of every
 * session it has open (sessions created since the listing was read come first) and renames it has not shown yet.
 */
export function projectSessions(input: {
  readonly listed: readonly SessionSummary[];
  readonly projectPath: string;
  readonly entries: Readonly<Record<string, SessionDirectoryEntry>>;
  readonly optimism: Readonly<Record<string, SessionOptimism>>;
}): SessionSummary[] {
  const {entries, listed, optimism, projectPath} = input;
  const listedIds = new Set(listed.map((session) => session.id));
  const added = Object.values(entries).flatMap((entry) => (entry.projectPath === projectPath && entry.summary && !listedIds.has(entry.summary.id) ? [entry.summary] : []));
  return [...added, ...listed].map((listedSummary) => {
    const summary = entries[listedSummary.id]?.summary ?? listedSummary;
    const title = optimism[summary.id]?.title;
    return title === undefined ? summary : {...summary, title};
  });
}

/** A session as its page shows it: its document and the runtime's report, with the user's optimism applied to both. */
export function sessionView(input: {readonly session: Session | undefined; readonly entry: SessionDirectoryEntry | undefined; readonly optimism?: SessionOptimism}): SessionView {
  const {entry, optimism = {}, session} = input;
  const projected = session ? buildSessionTurns(session) : undefined;
  const undone = session ? buildSessionTurns({entries: session.undone, live: {}}).turns : [];
  const shown = projected?.turns ?? [];
  const {turns, undoneTurns} = optimism.navigation ? navigated(shown, undone, optimism.navigation.turnId) : {turns: shown, undoneTurns: undone};
  return {
    ...sessionStatus(entry, optimism),
    session,
    title: optimism.title ?? entry?.summary?.title ?? session?.title,
    turns,
    undoneTurns,
    liveTurn: projected?.liveTurn ?? (optimism.message && pendingTurn(optimism.message)),
  };
}
