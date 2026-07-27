import type {ThemeVariant} from "@/features/settings/lib/theme-resolver";

const dark = {
  codeThemeId: "github-dark",
  theme: {
    accent: "#0169cc",
    contrast: 60,
    fonts: {code: null, ui: null},
    ink: "#fcfcfc",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#00a240",
      diffRemoved: "#e02e2a",
    },
    surface: "#111111",
  },
  variant: "dark",
} as const satisfies ThemeVariant;

const light = {
  codeThemeId: "github-light",
  theme: {
    accent: "#0169cc",
    contrast: 45,
    fonts: {code: null, ui: null},
    ink: "#0d0d0d",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#00a240",
      diffRemoved: "#e02e2a",
    },
    surface: "#ffffff",
  },
  variant: "light",
} as const satisfies ThemeVariant;

export const supernovaTheme = {id: "supernova", name: "Supernova", dark, light} as const;
