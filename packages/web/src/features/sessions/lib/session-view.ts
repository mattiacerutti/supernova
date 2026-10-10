import type {SessionActivity, SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import type {LiveState, Session, SessionSummary} from "@supernova/contracts/services/sessions/schemas";
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
  readonly pinned: boolean;
  /** Visible turns, moved by an undo, redo, or revert the runtime has not confirmed. */
  readonly turns: readonly SessionTurn[];
  readonly undoneTurns: readonly SessionTurn[];
  /** The turn being answered: the runtime's, or the user's sent message until the runtime shows it. */
  readonly liveTurn: SessionTurn | undefined;
}

/**
 * What a session is doing, from its `pi.live`; the same derivation the runtime's `SessionWorker` publishes to the
 * directory. A manual compaction runs without a run, so it is listed on its own.
 */
function activityOf(live: LiveState): SessionActivity {
  if ((live.compactions ?? []).some((compaction) => compaction.blocking || compaction.reason === "manual")) return "compacting";
  return live.run === undefined ? "idle" : "running";
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

/** Splits a session's turns at an unconfirmed undo, redo, or revert: every turn through `lastTurnId` shown, the rest undone. */
function navigated(turns: readonly SessionTurn[], undoneTurns: readonly SessionTurn[], lastTurnId: string | null) {
  const all = [...turns, ...undoneTurns];
  const shown = lastTurnId === null ? 0 : all.findIndex((turn) => turn.id === lastTurnId) + 1;
  // A target the document no longer has leaves the timeline as the runtime shows it.
  if (lastTurnId !== null && shown === 0) return {turns, undoneTurns};
  return {turns: all.slice(0, shown), undoneTurns: all.slice(shown)};
}

/** A session's summary as the UI shows it: the runtime's newest, with a rename or pin it has not shown yet. */
function sessionSummary(listed: SessionSummary, entry: SessionDirectoryEntry | undefined, optimism: SessionOptimism = {}): SessionSummary {
  const summary = entry?.summary ?? listed;
  return {...summary, title: optimism.title ?? summary.title, pinned: optimism.pinned ?? summary.pinned};
}

/** The order the runtime lists sessions in: pinned first, then newest. */
function listingOrder(left: SessionSummary, right: SessionSummary): number {
  return Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

/**
 * What a session is doing as the UI shows it; for a sidebar row or a command's idle check. The document's `live` is
 * the source when given: the directory's activity is a projection of it that replicates separately, so reading it with
 * the document in hand can show a run as still running after its turn settled, or the reverse, for a frame.
 */
export function sessionStatus(entry: SessionDirectoryEntry | undefined, optimism: SessionOptimism = {}, session?: Pick<Session, "live">): SessionStatus {
  const activity = session ? activityOf(session.live) : (entry?.activity ?? "idle");
  const serverError = entry?.error && entry.error.at !== optimism.seenErrorAt ? entry.error.message : null;
  return {
    status: statusOf(activity, optimism),
    // The step the client knows of shows until the runtime reports one or the run starts.
    setupStep: entry?.setupStep ?? (activity === "idle" ? (optimism.setupStep ?? null) : null),
    error: optimism.error ?? serverError,
  };
}

/**
 * The pages of a project's sessions loaded so far, as the sidebar lists them: the runtime's newest summary of every
 * session it has open, sessions created since the first page was read, and renames and pins it has not shown yet,
 * in the runtime's order. A row a pin or new activity moves past the last loaded page stays in view until it reloads.
 */
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

/** A session as its page shows it: its document and the runtime's report, with the user's optimism applied to both. */
export function sessionView(input: {readonly session: Session | undefined; readonly entry: SessionDirectoryEntry | undefined; readonly optimism?: SessionOptimism}): SessionView {
  const {entry, optimism = {}, session} = input;
  const projected = session ? buildSessionTurns(session) : undefined;
  const undone = session ? buildSessionTurns({entries: session.undone, live: {}}).turns : [];
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
