import type {HistorySide, SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session, SessionEntries, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {SessionDirectoryEntry} from "@supernova/contracts/services/sessions/services";
import {create} from "zustand";

export interface PendingMessage {
  readonly id: string;
  readonly contentParts: readonly UserMessageContentPart[];
  readonly timestamp: string;
}

export interface SessionOptimism {
  readonly message?: PendingMessage;
  /** Turns through `lastTurnId` shown, the rest undone; `null` shows none. */
  readonly navigation?: {readonly lastTurnId: string | null};
  readonly stopping?: boolean;
  readonly compacting?: boolean;
  readonly title?: string;
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly setupStep?: SessionSetupStep;
  readonly error?: string;
}

interface SessionsStoreState {
  readonly entries: Readonly<Record<string, SessionDirectoryEntry>>;
  readonly documents: Readonly<Record<string, Session>>;
  readonly loadErrors: Readonly<Record<string, string>>;
  readonly optimism: Readonly<Record<string, SessionOptimism>>;
  readonly setEntries: (entries: Readonly<Record<string, SessionDirectoryEntry>>) => void;
  readonly setDocument: (session: Session) => void;
  /** A page whose edge the document no longer has is dropped. */
  readonly addHistoryPage: (sessionId: string, side: HistorySide, edge: number, page: SessionEntries) => void;
  readonly setLoadError: (sessionId: string, message: string) => void;
  readonly patchOptimism: (sessionId: string, change: SessionOptimism) => void;
  readonly forget: (sessionId: string) => void;
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([recordKey]) => recordKey !== key));
}

function reuseEntries(known: SessionEntries, next: SessionEntries): SessionEntries {
  // Merging a paged window must not make every streaming partial rebuild the loaded transcript.
  return known.remaining === next.remaining && known.items.length === next.items.length && known.items.every((item, index) => item === next.items[index]) ? known : next;
}

/**
 * Navigation only moves the leaf, so entries this client has stay part of the branch and are kept around the new
 * window. A window with nothing outside it replaces everything.
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
  return {...next, entries: reuseEntries(known.entries, entries), undone: reuseEntries(known.undone, undone)};
}

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
