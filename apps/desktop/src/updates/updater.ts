import {existsSync} from "node:fs";
import {join} from "node:path";
import {app} from "electron";
import {autoUpdater} from "electron-updater";
import type {DesktopUpdateState} from "@supernova/contracts/lib/desktop";
import type {UpdaterEvent} from "@/updates/state";
import {INITIAL_UPDATE_STATE, reduceUpdateState} from "@/updates/state";

const STARTUP_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 60 * 60 * 1_000;

interface CreateDesktopUpdaterOptions {
  readonly nightly: boolean;
  readonly onStateChange: (state: DesktopUpdateState) => void;
}

interface DesktopUpdater {
  readonly getState: () => DesktopUpdateState;
  readonly start: () => void;
  readonly check: () => Promise<DesktopUpdateState | null>;
  readonly download: () => Promise<void>;
  readonly install: (version: string, beforeInstall: () => Promise<boolean>) => Promise<void>;
}

function isAutoUpdateSupported(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === "linux" && !process.env.APPIMAGE) return false;
  return existsSync(join(process.resourcesPath, "app-update.yml"));
}

export function createDesktopUpdater({nightly, onStateChange}: CreateDesktopUpdaterOptions): DesktopUpdater {
  const supported = isAutoUpdateSupported();
  let state = INITIAL_UPDATE_STATE;
  let updating = false;
  let checking: Promise<boolean> | undefined;

  const setState = (next: DesktopUpdateState): void => {
    if (next === state) return;
    state = next;
    onStateChange(state);
  };

  const applyEvent = (event: UpdaterEvent): void => {
    setState(reduceUpdateState(state, event));
  };

  const refresh = (): Promise<boolean> => {
    // Failures surface through the updater "error" event.
    return (checking ??= autoUpdater
      .checkForUpdates()
      .catch(() => null)
      .then((result) => result?.isUpdateAvailable === true)
      .finally(() => {
        checking = undefined;
      }));
  };

  const checkForUpdates = async (): Promise<void> => {
    if (!updating) await refresh();
  };

  return {
    getState: () => state,

    start: () => {
      if (!supported) return;

      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      if (nightly) {
        autoUpdater.channel = "nightly";
        autoUpdater.allowPrerelease = true;
        autoUpdater.allowDowngrade = true;
      }

      autoUpdater.on("checking-for-update", () => applyEvent({type: "checking"}));
      autoUpdater.on("update-available", (info) => applyEvent({type: "available", version: info.version}));
      autoUpdater.on("update-not-available", () => applyEvent({type: "not-available"}));
      autoUpdater.on("download-progress", (progress) => applyEvent({type: "download-progress", percent: Math.round(progress.percent)}));
      autoUpdater.on("update-downloaded", (info) => applyEvent({type: "downloaded", version: info.version}));
      autoUpdater.on("error", (error) => applyEvent({type: "error", message: error.message}));

      setTimeout(() => void checkForUpdates(), STARTUP_CHECK_DELAY_MS);
      setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
    },

    check: async () => {
      if (!supported) return null;
      // electron-updater emits the check's events before its promise settles, so state is final here.
      await checkForUpdates();
      return state;
    },

    download: async () => {
      if (!supported || updating || state.version === null) return;

      updating = true;
      try {
        if (!(await refresh()) || state.status !== "available") return;

        setState({status: "downloading", version: state.version, downloadPercent: 0, message: null});
        await autoUpdater.downloadUpdate().catch(() => undefined);
      } finally {
        updating = false;
      }
    },

    install: async (version, beforeInstall) => {
      if (!supported || updating) return;

      updating = true;
      try {
        // A check already in flight can invalidate the version the user confirmed.
        if (checking) await checking;
        if (state.status !== "downloaded" || state.version !== version) return;

        if (await beforeInstall()) autoUpdater.quitAndInstall(true, true);
      } finally {
        updating = false;
      }
    },
  };
}
