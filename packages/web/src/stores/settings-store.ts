import type {DesktopTheme} from "@supernova/contracts/lib/desktop";
import {create} from "zustand";
import {persist} from "zustand/middleware";
import type {ThemeId} from "@/lib/themes/theme";
import {defaultTheme, getAppTheme, resolveTheme} from "@/lib/themes/theme";

const SETTINGS_STORAGE_KEY = "supernova-settings";
const SYSTEM_DARK_MODE_QUERY = "(prefers-color-scheme: dark)";
const FONT_SIZE_TARGETS = ["interface", "code", "terminal"] as const;

export const DEFAULT_UI_FONT = "-apple-system, BlinkMacSystemFont, Inter, sans-serif";
export const DEFAULT_CODE_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
export const DEFAULT_FONT_SIZES = {interface: 16, code: 13, terminal: 12} as const;

export const FONT_SIZE_OPTIONS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] as const;
export const CONVERSATION_WIDTHS = {comfortable: "48rem", wide: "64rem", full: "none"} as const;

export type ResolvedAppearanceMode = Exclude<DesktopTheme, "system">;
export type FontSizeTarget = (typeof FONT_SIZE_TARGETS)[number];
export type ConversationWidth = keyof typeof CONVERSATION_WIDTHS;
type FontSizes = Record<FontSizeTarget, number>;

interface Settings {
  readonly captureCheckpoints: boolean;
  readonly confirmCheckpointConflicts: boolean;

  readonly mode: DesktopTheme;
  readonly themeId: ThemeId;

  readonly uiFont: string | undefined;
  readonly codeFont: string | undefined;
  readonly fontSizes: FontSizes;
  readonly fontSmoothing: boolean;

  readonly conversationWidth: ConversationWidth;
  readonly translucentSidebar: boolean;
}

interface SettingsState extends Settings {
  readonly resolvedMode: ResolvedAppearanceMode;

  readonly setCaptureCheckpoints: (enabled: boolean) => void;
  readonly setConfirmCheckpointConflicts: (enabled: boolean) => void;

  readonly setMode: (mode: DesktopTheme) => void;
  readonly setThemeId: (themeId: ThemeId) => void;

  readonly setUiFont: (font: string | undefined) => void;
  readonly setCodeFont: (font: string | undefined) => void;
  readonly setFontSize: (target: FontSizeTarget, size: number) => void;
  readonly setFontSmoothing: (enabled: boolean) => void;

  readonly setConversationWidth: (width: ConversationWidth) => void;
  readonly setTranslucentSidebar: (enabled: boolean) => void;
}

const defaultSettings: Settings = {
  captureCheckpoints: true,
  confirmCheckpointConflicts: true,

  mode: "system",
  themeId: defaultTheme.id,

  uiFont: undefined,
  codeFont: undefined,
  fontSizes: DEFAULT_FONT_SIZES,
  fontSmoothing: true,

  conversationWidth: "comfortable",
  translucentSidebar: true,
};

function validFontSize(size: unknown): size is number {
  return typeof size === "number" && FONT_SIZE_OPTIONS.some((option) => option === size);
}

function mergeSettings(persisted: unknown, current: SettingsState): SettingsState {
  const saved = (persisted as Partial<Settings> | undefined) ?? {};
  const fontSizes: FontSizes = {...DEFAULT_FONT_SIZES};
  for (const target of FONT_SIZE_TARGETS) {
    const size = saved.fontSizes?.[target];
    if (validFontSize(size)) fontSizes[target] = size;
  }

  const conversationWidth = saved.conversationWidth;
  return {
    ...current,
    ...saved,
    fontSizes,
    conversationWidth: conversationWidth && Object.hasOwn(CONVERSATION_WIDTHS, conversationWidth) ? conversationWidth : defaultSettings.conversationWidth,
  };
}

function getSystemMode(): ResolvedAppearanceMode {
  return typeof window !== "undefined" && window.matchMedia(SYSTEM_DARK_MODE_QUERY).matches ? "dark" : "light";
}

function setCssVariable(property: string, value: string | undefined): void {
  document.documentElement.style.setProperty(property, value ?? "");
}

function applyFontSize(target: FontSizeTarget, size: number): void {
  if (target === "terminal") return;
  setCssVariable(`--${target}-font-size`, `${size}px`);
}

function applyTheme(mode: DesktopTheme, themeId: ThemeId): ResolvedAppearanceMode {
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      resolvedMode: getSystemMode(),

      setCaptureCheckpoints: (captureCheckpoints) => set({captureCheckpoints}),
      setConfirmCheckpointConflicts: (confirmCheckpointConflicts) => set({confirmCheckpointConflicts}),

      setMode: (mode) => {
        set((state) => ({mode, resolvedMode: applyTheme(mode, state.themeId)}));
      },
      setThemeId: (themeId) => {
        set((state) => ({themeId, resolvedMode: applyTheme(state.mode, themeId)}));
      },

      setUiFont: (uiFont) => {
        setCssVariable("--font-sans", uiFont);
        set({uiFont});
      },
      setCodeFont: (codeFont) => {
        setCssVariable("--font-mono", codeFont);
        set({codeFont});
      },
      setFontSize: (target, size) => {
        if (!validFontSize(size)) return;
        applyFontSize(target, size);
        set((state) => ({fontSizes: {...state.fontSizes, [target]: size}}));
      },
      setFontSmoothing: (fontSmoothing) => {
        document.documentElement.dataset.fontSmoothing = String(fontSmoothing);
        set({fontSmoothing});
      },

      setConversationWidth: (conversationWidth) => {
        setCssVariable("--conversation-width", CONVERSATION_WIDTHS[conversationWidth]);
        set({conversationWidth});
      },
      setTranslucentSidebar: (translucentSidebar) => set({translucentSidebar}),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      merge: mergeSettings,
      partialize: (state) => ({...state, resolvedMode: undefined}),
    }
  )
);

export function initializeAppearance(): void {
  const state = useSettingsStore.getState();
  for (const target of FONT_SIZE_TARGETS) applyFontSize(target, state.fontSizes[target]);
  setCssVariable("--font-sans", state.uiFont);
  setCssVariable("--font-mono", state.codeFont);
  setCssVariable("--conversation-width", CONVERSATION_WIDTHS[state.conversationWidth]);
  document.documentElement.dataset.fontSmoothing = String(state.fontSmoothing);
  useSettingsStore.setState({resolvedMode: applyTheme(state.mode, state.themeId)});

  window.matchMedia(SYSTEM_DARK_MODE_QUERY).addEventListener("change", () => {
    const currentState = useSettingsStore.getState();
    if (currentState.mode !== "system") return;
    useSettingsStore.setState({resolvedMode: applyTheme("system", currentState.themeId)});
  });
}
