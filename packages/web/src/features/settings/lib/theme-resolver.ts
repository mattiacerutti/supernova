export interface ThemeVariant {
  readonly codeThemeId: string;
  readonly theme: {
    readonly accent: string;
    readonly contrast: number;
    readonly fonts: {
      readonly code: string | null;
      readonly ui: string | null;
    };
    readonly ink: string;
    readonly opaqueWindows: boolean;
    readonly semanticColors: {
      readonly diffAdded: string;
      readonly diffRemoved: string;
    };
    readonly surface: string;
  };
  readonly variant: "dark" | "light";
}

const CONTRAST_BASELINE = {
  dark: 60,
  light: 45,
} as const;

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(first: string, second: string, amount: number): string {
  const from = hexToRgb(first);
  const to = hexToRgb(second);
  const clampedAmount = Math.min(Math.max(amount, 0), 1);
  const channel = (index: number) => Math.round(from[index]! + (to[index]! - from[index]!) * clampedAmount);
  return `#${channel(0).toString(16).padStart(2, "0")}${channel(1).toString(16).padStart(2, "0")}${channel(2).toString(16).padStart(2, "0")}`;
}

function alpha(color: string, opacity: number): string {
  const [red, green, blue] = hexToRgb(color);
  const normalizedOpacity = Math.round(Math.min(Math.max(opacity, 0), 1) * 1_000) / 1_000;
  return `rgb(${red} ${green} ${blue} / ${normalizedOpacity})`;
}

function normalizeContrastStrength(contrast: number, variant: ThemeVariant["variant"]): number {
  const baseline = CONTRAST_BASELINE[variant];
  const curvedStrength = contrast / 100 + ((contrast - baseline) / 60) * 0.7;
  return contrast <= baseline ? curvedStrength : baseline / 100 + (curvedStrength - baseline / 100) * 2;
}

/** Resolves compact theme seeds into the runtime colors consumed by the UI. */
export function resolveTheme(variant: ThemeVariant) {
  const {accent, contrast, ink, semanticColors, surface} = variant.theme;
  const mode = variant.variant;
  const dark = mode === "dark";
  const strength = normalizeContrastStrength(contrast, mode);
  const baseline = CONTRAST_BASELINE[mode];
  const surfaceDeep = dark ? mix(surface, "#000000", 0.16 + (contrast - baseline) * 0.0015) : mix(surface, ink, 0.04 + (contrast - baseline) * 0.0012);
  const surfaceRaised = alpha(ink, dark ? 0.04 + strength * 0.02 : 0.04);
  const surfaceElevatedSecondaryOpacity = dark ? 0.02 + strength * 0.02 : 0.04;
  const surfaceElevatedSecondary = alpha(ink, surfaceElevatedSecondaryOpacity);
  const surfaceDrawer = mix(surface, ink, surfaceElevatedSecondaryOpacity * 0.76);
  const controlBase = mix(surface, dark ? ink : "#ffffff", dark ? 0.047 + strength * 0.05 : 0.09 + strength * 0.04);
  const surfaceControl = dark ? controlBase : `color-mix(in oklab, ${alpha(controlBase, 0.96)} 90%, transparent)`;
  const surfacePopover = mix(surface, dark ? ink : "#ffffff", dark ? 0.063 + strength * 0.08 : 0.16 + strength * 0.12);
  const surfaceRecessed = mix(surface, dark ? ink : "#ffffff", (dark ? 0.03 : 0.18) + strength * (dark ? 0.03 : 0.008));
  const accentFocusBase = dark ? mix(accent, "#ffffff", 0.3 + strength * 0.15) : accent;
  const textSecondaryOpacity = 0.65 + strength * 0.1;
  const textTertiaryOpacity = dark ? 0.42 + strength * 0.13 : 0.45 + strength * 0.1;
  const borderOpacity = dark ? 0.1 + strength * 0.04 : 0.09 + strength * 0.04;
  const borderMutedOpacity = dark ? 0.06 + strength * 0.02 : 0.07 + strength * 0.02;
  const borderStrongOpacity = dark ? 0.16 + strength * 0.06 : 0.09 + strength * 0.06;
  const overlayHoverOpacity = dark ? 0.06 + strength * 0.03 : 0.04;
  const overlayPressedOpacity = dark ? 0.04 + strength * 0.02 : 0.04;
  const overlayStrongOpacity = dark ? 0.07 + strength * 0.05 : 0.16 + strength * 0.08;

  return {
    surface,
    "surface-deep": surfaceDeep,
    "surface-raised": surfaceRaised,
    "surface-inset": surfaceControl,
    "surface-sidebar": surface,
    "surface-contrast": surfaceControl,
    "surface-recessed": surfaceRecessed,
    "surface-popover": surfacePopover,
    "surface-drawer": surfaceDrawer,
    "surface-elevated-secondary": surfaceElevatedSecondary,
    ink,
    "ink-strong": ink,
    "ink-muted": alpha(ink, textSecondaryOpacity),
    "ink-faint": alpha(ink, textTertiaryOpacity),
    "ink-inverse": surface,
    border: alpha(ink, borderOpacity),
    "border-muted": alpha(ink, borderMutedOpacity),
    "border-strong": alpha(ink, borderStrongOpacity),
    "overlay-hover": alpha(ink, overlayHoverOpacity),
    "overlay-pressed": alpha(ink, overlayPressedOpacity),
    "overlay-strong": alpha(ink, overlayStrongOpacity),
    "overlay-scrim": alpha("#000000", 0.6),
    accent: accentFocusBase,
    "accent-focus": dark ? alpha(accentFocusBase, 0.7 + strength * 0.1) : accentFocusBase,
    "diff-added": semanticColors.diffAdded,
    "diff-removed": semanticColors.diffRemoved,
    "diff-removed-surface": alpha(semanticColors.diffRemoved, dark ? 0.23 : 0.15),
  } as const;
}
