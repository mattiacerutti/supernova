import type {SessionDirectoryEntry} from "@supernova/contracts/services/sessions/services";
import {sessionToastManager} from "@/lib/toast";

const openListeners = new Set<(sessionId: string) => void>();

export function onOpenExtensionNotices(listener: (sessionId: string) => void): () => void {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}

function openExtensionNotices(sessionId: string): void {
  for (const listener of openListeners) listener(sessionId);
}

/**
 * Extension notices arrive in a batch when a session opens, so they share one persistent toast that opens the dialog;
 * every other notice is its own fading toast.
 */
export class NoticeToasts {
  private readonly shown = new Set<string>();
  private readonly extensionToasts = new Map<string, string>();

  public show(entries: Readonly<Record<string, SessionDirectoryEntry>>): void {
    for (const [sessionId, entry] of Object.entries(entries)) {
      for (const notice of entry.notices) {
        if (this.shown.has(notice.id)) continue;
        this.shown.add(notice.id);
        const toasts = sessionToastManager(sessionId);
        if (notice.extensionPath === undefined) {
          toasts.add({title: notice.level === "error" ? "Something went wrong" : "Notice", description: notice.message, type: notice.level});
        } else if (!this.extensionToasts.has(sessionId)) {
          const toastId = toasts.add({
            title: "Some extensions are limited",
            description: "Some of what your extensions do isn't supported in Supernova yet.",
            type: "warning",
            timeout: 0,
            actionProps: {children: "Details", onClick: () => openExtensionNotices(sessionId)},
            onClose: () => this.extensionToasts.delete(sessionId),
          });
          this.extensionToasts.set(sessionId, toastId);
        }
      }
    }
  }
}
