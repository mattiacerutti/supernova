import {Toast} from "@base-ui/react/toast";
import {useSyncExternalStore} from "react";

export type ToastManager = ReturnType<typeof Toast.createToastManager>;

/** App-wide toasts: shown on every page. */
export const toastManager: ToastManager = Toast.createToastManager();

const sessionToastManagers = new Map<string, ToastManager>();
const sessionListeners = new Set<() => void>();

/**
 * The toasts of one session: shown only while its page is open, and stacked among themselves. Each session has its own
 * queue because the toast library lays a queue out as one stack; a filtered view of a shared queue would keep the gaps
 * of the toasts it hides. A queue outlives the pages that show it, so a toast raised for a session the user is not on
 * waits for them.
 */
export function sessionToastManager(sessionId: string): ToastManager {
  let manager = sessionToastManagers.get(sessionId);
  if (!manager) {
    manager = bufferedToastManager();
    sessionToastManagers.set(sessionId, manager);
    for (const listener of sessionListeners) listener();
  }
  return manager;
}

/**
 * A toast manager that holds what is added before a provider subscribes. The library's manager only forwards to current
 * subscribers, and a session's provider mounts a render after its queue is first used, so the first toasts would be lost.
 */
function bufferedToastManager(): ToastManager {
  const manager = Toast.createToastManager();
  const subscribe = manager[" subscribe"];
  const pending: (() => void)[] = [];
  let subscribed = false;
  const buffered: ToastManager = {
    ...manager,
    " subscribe": (listener) => {
      const unsubscribe = subscribe(listener);
      if (!subscribed) {
        subscribed = true;
        for (const replay of pending.splice(0)) replay();
      }
      return unsubscribe;
    },
    add: (options) => {
      const id = options.id ?? `toast-${crypto.randomUUID()}`;
      const replay = () => manager.add({...options, id});
      if (subscribed) replay();
      else pending.push(replay);
      return id;
    },
  };
  return buffered;
}

let snapshot: readonly (readonly [string, ToastManager])[] = [];
function subscribeSessions(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}
function sessionsSnapshot(): readonly (readonly [string, ToastManager])[] {
  if (snapshot.length !== sessionToastManagers.size) snapshot = [...sessionToastManagers];
  return snapshot;
}

/** Every session queue created so far, for the viewport to mount; a queue must be mounted to hold toasts. */
export function useSessionToastManagers(): readonly (readonly [string, ToastManager])[] {
  return useSyncExternalStore(subscribeSessions, sessionsSnapshot);
}

interface ShowToastOptions extends Omit<Parameters<ToastManager["add"]>[0], "title" | "description"> {
  /** Scopes the toast to a session: it shows only while that session's page is open. */
  readonly sessionId?: string;
}

/** Shows a toast from anywhere, including code that runs outside React. */
export function showToast(title: string, description: string, options: ShowToastOptions = {}): void {
  const {sessionId, ...toast} = options;
  (sessionId === undefined ? toastManager : sessionToastManager(sessionId)).add({title, description, ...toast});
}
