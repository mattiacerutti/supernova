import {useRef, useState} from "react";
import type {DesktopUpdateState} from "@supernova/contracts/lib/desktop";
import {showToast} from "@/lib/toast";
import {useMountEffect} from "@/hooks/use-mount-effect";

interface DesktopUpdate {
  readonly state: DesktopUpdateState | undefined;
  readonly check: () => Promise<DesktopUpdateState | null>;
  readonly download: () => Promise<void>;
  readonly install: () => Promise<void>;
}

export function useDesktopUpdate(): DesktopUpdate {
  const [state, setState] = useState<DesktopUpdateState>();
  const reportedStatus = useRef<DesktopUpdateState["status"] | undefined>(undefined);

  useMountEffect(() => {
    const api = window.desktopApi;
    if (!api) return;

    let active = true;

    const applyState = (next: DesktopUpdateState): void => {
      // Failures arrive as pushed state, not rejected calls; report once per transition into error.
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
    check: async () => (await window.desktopApi?.checkForUpdates()) ?? null,
    download: async () => window.desktopApi?.downloadUpdate(),
    install: async () => window.desktopApi?.installUpdate(),
  };
}
