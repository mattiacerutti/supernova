import type {DesktopApi, DesktopEnvironment} from "@supernova/contracts/lib/desktop";

declare global {
  interface Window {
    /** Preload bridge injected by the Electron shell; absent in the browser. */
    desktopApi?: DesktopApi;
  }
}

export type AppEnvironment = "web" | DesktopEnvironment;

/** Host the renderer runs in. Fixed for the lifetime of the page, so it is a constant rather than context. */
export const appEnvironment: AppEnvironment = window.desktopApi?.environment ?? "web";

export const isDesktopEnvironment = appEnvironment !== "web";
export const isMacEnvironment = appEnvironment === "mac";
export const isWindowsEnvironment = appEnvironment === "windows";
