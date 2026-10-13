export type DesktopEnvironment = "mac" | "windows" | "linux";

export type DesktopTheme = "dark" | "light" | "system";

export type DesktopUpdateStatus = "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";

export interface DesktopUpdateState {
  readonly status: DesktopUpdateStatus;
  /** Version offered by the update feed, kept across download and error states. */
  readonly version: string | null;
  readonly downloadPercent: number | null;
  readonly message: string | null;
}

export type DesktopEditorId = "vscode" | "cursor" | "zed";

/** An editor the desktop app can open a directory in. */
export interface DesktopEditor {
  readonly id: DesktopEditorId;
  readonly label: string;
}

export interface DesktopApi {
  readonly environment: DesktopEnvironment;
  readonly serverUrl: string;
  readonly appVersion: string;
  readonly nightly: boolean;
  readonly openDirectory: (path: string) => Promise<void>;
  /** The supported editors installed on this machine, checked on each call. */
  readonly listEditors: () => Promise<DesktopEditor[]>;
  /** Opens a directory as a window of an installed editor; rejects when it is not installed or fails to start. */
  readonly openInEditor: (editor: DesktopEditorId, path: string) => Promise<void>;
  readonly setNativeTheme: (theme: DesktopTheme) => Promise<void>;
  readonly getUpdateState: () => Promise<DesktopUpdateState>;
  readonly checkForUpdates: () => Promise<DesktopUpdateState | null>;
  readonly downloadUpdate: () => Promise<void>;
  readonly installUpdate: () => Promise<void>;
  readonly onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
}
