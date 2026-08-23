import type {DesktopEnvironment} from "@supernova/contracts/desktop/api";

export type AppEnvironment = "web" | DesktopEnvironment;

export function isDesktopEnvironment(appEnvironment: AppEnvironment): boolean {
  return appEnvironment !== "web";
}
