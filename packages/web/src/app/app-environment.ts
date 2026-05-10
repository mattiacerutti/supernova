export type AppEnvironment = "web" | "mac" | "windows" | "linux";

export function getAppEnvironment(platform?: string): AppEnvironment {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "windows";
  if (platform) return "linux";

  return "web";
}

export function isDesktopEnvironment(appEnvironment: AppEnvironment): boolean {
  return appEnvironment !== "web";
}

export function isMacEnvironment(appEnvironment: AppEnvironment): boolean {
  return appEnvironment === "mac";
}
