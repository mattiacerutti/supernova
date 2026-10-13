import type {HistorySide, SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session, SessionEntries, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {SessionDirectoryEntry} from "@supernova/contracts/services/sessions/services";
import {create} from "zustand";

/** A message sent and not yet in the session's document. */
export interface PendingMessage {
  readonly id: string;
  readonly contentParts: readonly UserMessageContentPart[];
  readonly timestamp: string;
}

/** What the user did in a session that the server's state does not show yet. */
export interface SessionOptimism {
  readonly message?: PendingMessage;
  /**
   * An undo, redo, or revert in flight, as the timeline it leads to: every turn through `lastTurnId` shown, the rest
   * undone; `null` when it leaves no turn shown. Where it leads does not change when the runtime applies it.
   */
  readonly navigation?: {readonly lastTurnId: string | null};
  readonly stopping?: boolean;
  readonly compacting?: boolean;
  readonly title?: string;
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly setupStep?: SessionSetupStep;
  /** The last command that failed before reaching the runtime; the runtime's own problems arrive as notices. */
  readonly error?: string;
}

interface SessionsStoreState {
  /** What the server reports about every session it has open, from its directory. */
  readonly entries: Readonly<Record<string, SessionDirectoryEntry>>;
  /** Documents of the sessions this client followed or read. */
  readonly documents: Readonly<Record<string, Session>>;
  /** Sessions whose document could not be read. */
  readonly loadErrors: Readonly<Record<string, string>>;
  readonly optimism: Readonly<Record<string, SessionOptimism>>;
  readonly setEntries: (entries: Readonly<Record<string, SessionDirectoryEntry>>) => void;
  readonly setDocument: (session: Session) => void;
  /**
   * Extends a document's branch with a page loaded next to `edge`: shown turns before its first entry, or undone turns
   * after its last. A page whose edge the document no longer has is dropped.
   */
  readonly addHistoryPage: (sessionId: string, side: HistorySide, edge: number, page: SessionEntries) => void;
  readonly setLoadError: (sessionId: string, message: string) => void;
  /** Shallow-merges into a session's optimism; `undefined` clears a field. */
  readonly patchOptimism: (sessionId: string, change: SessionOptimism) => void;
  /** Drops everything this client holds about a session. */
  readonly forget: (sessionId: string) => void;
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([recordKey]) => recordKey !== key));
}

/**
 * `next` with the branch this client already has. A document is a window around the leaf: the newest shown turns and
 * the oldest undone ones. Undo, redo, and revert only move the leaf, so entries the client has stay part of the branch;
 * it keeps the shown ones before the window and the undone ones after it while the window's edges are entries it has.
 * A window with nothing outside it (a send after undoing every turn starts a new history) replaces everything.
 */
function withKnownBranch(known: Session | undefined, next: Session): Session {
  if (!known) return next;
  const branch = [...known.entries.items, ...known.undone.items];
  let {entries, undone} = next;
  const first = entries.items[0]?.id;
  const firstAt = first === undefined ? -1 : branch.findIndex((entry) => entry.id === first);
  if (entries.remaining > 0 && firstAt > 0) entries = {items: [...branch.slice(0, firstAt), ...entries.items], remaining: known.entries.remaining};
  const last = undone.items.at(-1)?.id;
  const lastAt = last === undefined ? -1 : branch.findIndex((entry) => entry.id === last);
  if (undone.remaining > 0 && lastAt >= 0 && lastAt < branch.length - 1) undone = {items: [...undone.items, ...branch.slice(lastAt + 1)], remaining: known.undone.remaining};
  return {...next, entries, undone};
}

/**
 * Everything this client knows about sessions: what the runtime pushes, filled only by `api/sessions-sync`, and what
 * the user did that the runtime does not show yet. Hooks read it through `lib/session-view`.
 */
export const useSessionsStore = create<SessionsStoreState>()((set) => ({
  entries: {},
  documents: {},
  loadErrors: {},
  optimism: {},
  setEntries: (entries) => set({entries}),
  setDocument: (session) =>
    set((state) => ({documents: {...state.documents, [session.id]: withKnownBranch(state.documents[session.id], session)}, loadErrors: without(state.loadErrors, session.id)})),
  addHistoryPage: (sessionId, side, edge, page) =>
    set((state) => {
      const session = state.documents[sessionId];
      if (!session) return state;
      const extended =
        side === "entries"
          ? session.entries.items[0]?.id === edge && {...session, entries: {items: [...page.items, ...session.entries.items], remaining: page.remaining}}
          : session.undone.items.at(-1)?.id === edge && {...session, undone: {items: [...session.undone.items, ...page.items], remaining: page.remaining}};
      return extended ? {documents: {...state.documents, [sessionId]: extended}} : state;
    }),
  setLoadError: (sessionId, message) => set((state) => ({loadErrors: {...state.loadErrors, [sessionId]: message}})),
  patchOptimism: (sessionId, change) => set((state) => ({optimism: {...state.optimism, [sessionId]: {...state.optimism[sessionId], ...change}}})),
  forget: (sessionId) =>
    set((state) => ({documents: without(state.documents, sessionId), loadErrors: without(state.loadErrors, sessionId), optimism: without(state.optimism, sessionId)})),
}));
