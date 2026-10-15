import type {DesktopApi, DesktopEnvironment} from "@supernova/contracts/lib/desktop";

declare global {
  interface Window {
    desktopApi?: DesktopApi;
  }
}

type AppEnvironment = "web" | DesktopEnvironment;

export const appEnvironment: AppEnvironment = window.desktopApi?.environment ?? "web";

export const isDesktopEnvironment = appEnvironment !== "web";
export const isMacEnvironment = appEnvironment === "mac";
export const isWindowsEnvironment = appEnvironment === "windows";
