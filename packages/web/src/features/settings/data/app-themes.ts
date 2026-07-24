import {supernovaTheme} from "@/features/settings/themes/supernova";

export const appThemes = [supernovaTheme] as const;
export const defaultTheme = supernovaTheme;
export type ThemeId = (typeof appThemes)[number]["id"];

/** Returns the selected bundled theme or the default theme. */
export function getAppTheme(themeId: string) {
  return appThemes.find((theme) => theme.id === themeId) ?? defaultTheme;
}
