export type DesktopEnvironment = "mac" | "windows" | "linux";

export type DesktopTheme = "dark" | "light" | "system";

export interface DesktopApi {
  readonly environment: DesktopEnvironment;
  readonly openDirectory: (path: string) => Promise<void>;
  readonly setNativeTheme: (theme: DesktopTheme) => Promise<void>;
}
