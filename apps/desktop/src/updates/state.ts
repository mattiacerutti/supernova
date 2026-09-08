import type {DesktopUpdateState} from "@supernova/contracts/desktop/api";

export type UpdaterEvent =
  | {type: "checking"}
  | {type: "available"; version: string}
  | {type: "not-available"}
  | {type: "download-progress"; percent: number}
  | {type: "downloaded"; version: string}
  | {type: "error"; message: string};

export const INITIAL_UPDATE_STATE: DesktopUpdateState = {status: "idle", version: null, downloadPercent: null, message: null};

/** Nightly builds carry a `-nightly.<date>.<run>` prerelease suffix produced by the release workflow. */
export function isNightlyVersion(version: string): boolean {
  return version.includes("-nightly.");
}

/**
 * Applies an electron-updater event to the renderer-facing update state.
 * Background checks never demote an in-flight download or a downloaded update.
 */
export function reduceUpdateState(state: DesktopUpdateState, event: UpdaterEvent): DesktopUpdateState {
  switch (event.type) {
    case "checking":
      return state.status === "idle" || state.status === "error" ? {...state, status: "checking", message: null} : state;
    case "available":
      if (state.status === "downloading") return state;
      if (state.status === "downloaded" && state.version === event.version) return state;
      return {status: "available", version: event.version, downloadPercent: null, message: null};
    case "not-available":
      return state.status === "downloading" || state.status === "downloaded" ? state : INITIAL_UPDATE_STATE;
    case "download-progress":
      return {status: "downloading", version: state.version, downloadPercent: event.percent, message: null};
    case "downloaded":
      return {status: "downloaded", version: event.version, downloadPercent: null, message: null};
    case "error":
      return {status: "error", version: state.version, downloadPercent: null, message: event.message};
  }
}
