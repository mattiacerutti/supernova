import type {DesktopTheme} from "@supernova/contracts/desktop/api";
import {create} from "zustand";
import {persist} from "zustand/middleware";
import {defaultTheme, getAppTheme} from "@/features/settings/lib/themes";
import type {ThemeId} from "@/features/settings/lib/themes";
import {resolveTheme} from "@/features/settings/lib/themes";

const APPEARANCE_STORAGE_KEY = "supernova-appearance";
const SYSTEM_DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export const DEFAULT_UI_FONT = "-apple-system, BlinkMacSystemFont, Inter, sans-serif";
export const DEFAULT_CODE_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export type ResolvedAppearanceMode = Exclude<DesktopTheme, "system">;

interface AppearanceState {
  readonly codeFont: string | undefined;
  readonly fontSmoothing: boolean;
  readonly mode: DesktopTheme;
  readonly resolvedMode: ResolvedAppearanceMode;
  readonly themeId: ThemeId;
  readonly translucentSidebar: boolean;
  readonly uiFont: string | undefined;
  readonly setCodeFont: (font: string | undefined) => void;
  readonly setFontSmoothing: (enabled: boolean) => void;
  readonly setMode: (mode: DesktopTheme) => void;
  readonly setThemeId: (themeId: ThemeId) => void;
  readonly setTranslucentSidebar: (enabled: boolean) => void;
  readonly setUiFont: (font: string | undefined) => void;
}

function getSystemMode(): ResolvedAppearanceMode {
  return window.matchMedia(SYSTEM_DARK_MODE_QUERY).matches ? "dark" : "light";
}

function applyFont(property: "--font-mono" | "--font-sans", font: string | undefined): void {
  if (font) {
    document.documentElement.style.setProperty(property, font);
  } else {
    document.documentElement.style.removeProperty(property);
  }
}

function applyAppearance(mode: DesktopTheme, themeId: ThemeId): ResolvedAppearanceMode {
  const resolvedMode = mode === "system" ? getSystemMode() : mode;
  const root = document.documentElement;
  const theme = getAppTheme(themeId);

  for (const [name, color] of Object.entries(resolveTheme(theme[resolvedMode]))) {
    root.style.setProperty(`--theme-${name}`, color);
  }

  root.dataset.colorMode = resolvedMode;
  root.dataset.theme = theme.id;
  root.style.colorScheme = resolvedMode;
  void window.desktopApi?.setNativeTheme(mode).catch(() => undefined);
  return resolvedMode;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      codeFont: undefined,
      fontSmoothing: true,
      mode: "system",
      resolvedMode: getSystemMode(),
      themeId: defaultTheme.id,
      translucentSidebar: true,
      uiFont: undefined,
      setCodeFont: (codeFont) => {
        applyFont("--font-mono", codeFont);
        set({codeFont});
      },
      setFontSmoothing: (fontSmoothing) => {
        document.documentElement.dataset.fontSmoothing = String(fontSmoothing);
        set({fontSmoothing});
      },
      setMode: (mode) => {
        set((state) => ({mode, resolvedMode: applyAppearance(mode, state.themeId)}));
      },
      setThemeId: (themeId) => {
        set((state) => ({themeId, resolvedMode: applyAppearance(state.mode, themeId)}));
      },
      setTranslucentSidebar: (translucentSidebar) => {
        set({translucentSidebar});
      },
      setUiFont: (uiFont) => {
        applyFont("--font-sans", uiFont);
        set({uiFont});
      },
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      partialize: (state) => ({
        codeFont: state.codeFont,
        fontSmoothing: state.fontSmoothing,
        mode: state.mode,
        themeId: state.themeId,
        translucentSidebar: state.translucentSidebar,
        uiFont: state.uiFont,
      }),
    }
  )
);

/** Applies the saved mode and tracks operating-system appearance changes. */
export function initializeAppearance(): void {
  const state = useAppearanceStore.getState();
  applyFont("--font-sans", state.uiFont);
  applyFont("--font-mono", state.codeFont);
  document.documentElement.dataset.fontSmoothing = String(state.fontSmoothing);
  useAppearanceStore.setState({resolvedMode: applyAppearance(state.mode, state.themeId)});

  window.matchMedia(SYSTEM_DARK_MODE_QUERY).addEventListener("change", () => {
    const currentState = useAppearanceStore.getState();
    if (currentState.mode !== "system") return;
    useAppearanceStore.setState({resolvedMode: applyAppearance("system", currentState.themeId)});
  });
}
