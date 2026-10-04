import type {SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
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
  /** An undo, redo, or revert in flight, and the turn it moves the timeline to. */
  readonly navigation?: {readonly turnId: string | undefined};
  readonly stopping?: boolean;
  readonly compacting?: boolean;
  readonly title?: string;
  readonly setupStep?: SessionSetupStep;
  /** The last command that failed. */
  readonly error?: string;
  /** When the server's last problem was raised, once a command moved past it. */
  readonly seenErrorAt?: string;
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
 * Everything this client knows about sessions: what the runtime pushes, filled only by `api/sessions-sync`, and what
 * the user did that the runtime does not show yet. Hooks read it through `lib/conversation/session-view`.
 */
export const useSessionsStore = create<SessionsStoreState>()((set) => ({
  entries: {},
  documents: {},
  loadErrors: {},
  optimism: {},
  setEntries: (entries) => set({entries}),
  setDocument: (session) => set((state) => ({documents: {...state.documents, [session.id]: session}, loadErrors: without(state.loadErrors, session.id)})),
  setLoadError: (sessionId, message) => set((state) => ({loadErrors: {...state.loadErrors, [sessionId]: message}})),
  patchOptimism: (sessionId, change) => set((state) => ({optimism: {...state.optimism, [sessionId]: {...state.optimism[sessionId], ...change}}})),
  forget: (sessionId) =>
    set((state) => ({documents: without(state.documents, sessionId), loadErrors: without(state.loadErrors, sessionId), optimism: without(state.optimism, sessionId)})),
}));
