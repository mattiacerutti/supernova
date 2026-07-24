import type {ThemeVariant} from "@/features/settings/lib/theme-resolver";

const dark = {
  codeThemeId: "github-dark",
  theme: {
    accent: "#0169cc",
    contrast: 60,
    fonts: {code: null, ui: null},
    ink: "#f7f7f7",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#34d399",
      diffRemoved: "#f87171",
      skill: "#0169cc",
    },
    surface: "#181818",
  },
  variant: "dark",
} as const satisfies ThemeVariant;

const light = {
  codeThemeId: "github",
  theme: {
    accent: "#0969da",
    contrast: 45,
    fonts: {code: null, ui: null},
    ink: "#1f2328",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#1a7f37",
      diffRemoved: "#cf222e",
      skill: "#8250df",
    },
    surface: "#ffffff",
  },
  variant: "light",
} as const satisfies ThemeVariant;

export const supernovaTheme = {id: "supernova", name: "Supernova", dark, light} as const;
