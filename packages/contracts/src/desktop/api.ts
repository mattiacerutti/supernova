export type DesktopEnvironment = "mac" | "windows" | "linux";

export type DesktopTheme = "dark" | "light" | "system";

export interface DesktopApi {
  readonly closeWindow: () => Promise<void>;
  readonly environment: DesktopEnvironment;
  readonly minimizeWindow: () => Promise<void>;
  readonly openDirectory: (path: string) => Promise<void>;
  readonly setNativeTheme: (theme: DesktopTheme) => Promise<void>;
  readonly toggleMaximizeWindow: () => Promise<void>;
}
