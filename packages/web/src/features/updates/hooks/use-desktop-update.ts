import {useRef, useState} from "react";
import type {DesktopUpdateState} from "@supernova/contracts/desktop/api";
import {showToast} from "@/components/ui/toast-manager";
import {useMountEffect} from "@/lib/use-mount-effect";

export interface DesktopUpdate {
  readonly state: DesktopUpdateState | undefined;
  readonly download: () => Promise<void>;
  readonly install: () => Promise<void>;
}

/**
 * Tracks the desktop auto-update state and exposes its actions, reporting update failures once
 * each. State stays undefined outside the desktop app, which hides the update UI.
 */
export function useDesktopUpdate(): DesktopUpdate {
  const [state, setState] = useState<DesktopUpdateState>();
  const reportedStatus = useRef<DesktopUpdateState["status"] | undefined>(undefined);

  useMountEffect(() => {
    const api = window.desktopApi;
    if (!api) return;

    let active = true;

    const applyState = (next: DesktopUpdateState): void => {
      // Updater failures arrive as pushed state rather than rejected calls, so
      // surface them here, once per transition into the error status.
      if (next.status === "error" && next.message && reportedStatus.current !== "error") {
        showToast("Update failed", next.message);
      }
      reportedStatus.current = next.status;
      setState(next);
    };

    // Pushed events win over the initial snapshot if they arrive first.
    void api.getUpdateState().then((initial) => {
      if (active) setState((current) => current ?? initial);
    });

    const unsubscribe = api.onUpdateState(applyState);
    return () => {
      active = false;
      unsubscribe();
    };
  });

  return {
    state,
    download: async () => window.desktopApi?.downloadUpdate(),
    install: async () => window.desktopApi?.installUpdate(),
  };
}
