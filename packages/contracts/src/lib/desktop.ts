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
  readonly listEditors: () => Promise<DesktopEditor[]>;
  readonly openInEditor: (editor: DesktopEditorId, path: string) => Promise<void>;
  readonly setNativeTheme: (theme: DesktopTheme) => Promise<void>;
  readonly getUpdateState: () => Promise<DesktopUpdateState>;
  readonly checkForUpdates: () => Promise<DesktopUpdateState | null>;
  readonly downloadUpdate: () => Promise<void>;
  readonly installUpdate: () => Promise<void>;
  readonly onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
}
