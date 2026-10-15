import {Toast} from "@base-ui/react/toast";
import {useSyncExternalStore} from "react";

export type ToastManager = ReturnType<typeof Toast.createToastManager>;

export const toastManager: ToastManager = Toast.createToastManager();

const sessionToastManagers = new Map<string, ToastManager>();
const sessionListeners = new Set<() => void>();

/** One queue per session: the library lays a queue out as one stack, so filtering a shared one would leave gaps. */
export function sessionToastManager(sessionId: string): ToastManager {
  let manager = sessionToastManagers.get(sessionId);
  if (!manager) {
    manager = bufferedToastManager();
    sessionToastManagers.set(sessionId, manager);
    for (const listener of sessionListeners) listener();
  }
  return manager;
}

/** Buffers toasts added before a provider subscribes; the library's manager forwards only to current subscribers. */
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

export function useSessionToastManagers(): readonly (readonly [string, ToastManager])[] {
  return useSyncExternalStore(subscribeSessions, sessionsSnapshot);
}

interface ShowToastOptions extends Omit<Parameters<ToastManager["add"]>[0], "title" | "description"> {
  readonly sessionId?: string;
}

export function showToast(title: string, description: string, options: ShowToastOptions = {}): void {
  const {sessionId, ...toast} = options;
  (sessionId === undefined ? toastManager : sessionToastManager(sessionId)).add({title, description, ...toast});
}
