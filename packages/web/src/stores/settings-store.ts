import type {DesktopTheme} from "@supernova/contracts/desktop/api";
import {create} from "zustand";
import {persist} from "zustand/middleware";
import type {ThemeId} from "@/lib/themes/theme";
import {defaultTheme, getAppTheme, resolveTheme} from "@/lib/themes/theme";

const SETTINGS_STORAGE_KEY = "supernova-settings";
const LEGACY_STORAGE_KEYS = ["supernova-appearance", "supernova-general-settings"];
const SYSTEM_DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export const DEFAULT_UI_FONT = "-apple-system, BlinkMacSystemFont, Inter, sans-serif";
export const DEFAULT_CODE_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export type ResolvedAppearanceMode = Exclude<DesktopTheme, "system">;

interface GeneralSettings {
  readonly captureCheckpoints: boolean;
  readonly confirmCheckpointConflicts: boolean;
  readonly setCaptureCheckpoints: (enabled: boolean) => void;
  readonly setConfirmCheckpointConflicts: (enabled: boolean) => void;
}

interface AppearanceSettings {
  readonly codeFont: string | undefined;
  readonly fontSmoothing: boolean;
  readonly mode: DesktopTheme;
  /** Derived from `mode` and the operating system by `initializeAppearance`; not persisted. */
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

type SettingsState = GeneralSettings & AppearanceSettings;

/** State keys that are computed at runtime rather than saved. Functions are already dropped by JSON. */
const TRANSIENT_KEYS = ["resolvedMode"] as const satisfies readonly (keyof SettingsState)[];

type PersistedSettings = Partial<Omit<SettingsState, (typeof TRANSIENT_KEYS)[number]>>;

type SettingsSlice<TSlice> = (set: (partial: Partial<SettingsState> | ((state: SettingsState) => Partial<SettingsState>)) => void) => TSlice;

function getSystemMode(): ResolvedAppearanceMode {
  return typeof window !== "undefined" && window.matchMedia(SYSTEM_DARK_MODE_QUERY).matches ? "dark" : "light";
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

/** Settings used to persist as two stores, one per settings section. Read them once so existing users keep theirs. */
function legacySettings(): PersistedSettings {
  let merged: PersistedSettings = {};
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) merged = {...merged, ...(JSON.parse(raw).state as PersistedSettings)};
    } catch {
      // Ignore unreadable legacy state; defaults apply.
    }
  }
  return merged;
}

const generalSettings: SettingsSlice<GeneralSettings> = (set) => ({
  captureCheckpoints: true,
  confirmCheckpointConflicts: true,
  setCaptureCheckpoints: (captureCheckpoints) => set({captureCheckpoints}),
  setConfirmCheckpointConflicts: (confirmCheckpointConflicts) => set({confirmCheckpointConflicts}),
});

const appearanceSettings: SettingsSlice<AppearanceSettings> = (set) => ({
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
  setTranslucentSidebar: (translucentSidebar) => set({translucentSidebar}),
  setUiFont: (uiFont) => {
    applyFont("--font-sans", uiFont);
    set({uiFont});
  },
});

/** User preferences, persisted per browser. Edited on the settings page, read across the app. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...generalSettings(set),
      ...appearanceSettings(set),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      merge: (persisted, current) => ({...current, ...((persisted as PersistedSettings | undefined) ?? legacySettings())}),
      partialize: (state): PersistedSettings =>
        Object.fromEntries(Object.entries(state).filter(([key, value]) => typeof value !== "function" && !TRANSIENT_KEYS.includes(key as (typeof TRANSIENT_KEYS)[number]))),
    }
  )
);

/** Applies the saved appearance and tracks operating-system appearance changes. */
export function initializeAppearance(): void {
  const state = useSettingsStore.getState();
  applyFont("--font-sans", state.uiFont);
  applyFont("--font-mono", state.codeFont);
  document.documentElement.dataset.fontSmoothing = String(state.fontSmoothing);
  useSettingsStore.setState({resolvedMode: applyAppearance(state.mode, state.themeId)});

  window.matchMedia(SYSTEM_DARK_MODE_QUERY).addEventListener("change", () => {
    const currentState = useSettingsStore.getState();
    if (currentState.mode !== "system") return;
    useSettingsStore.setState({resolvedMode: applyAppearance("system", currentState.themeId)});
  });
}
