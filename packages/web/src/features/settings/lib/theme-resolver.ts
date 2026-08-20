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

function hexToHsl(hex: string): readonly [number, number, number] {
  const [redChannel, greenChannel, blueChannel] = hexToRgb(hex);
  const red = redChannel / 255;
  const green = greenChannel / 255;
  const blue = blueChannel / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const base = 2 * lightness - chroma;
  const channel = (offset: number) => {
    let t = hue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    let value = base;
    if (t < 1 / 6) value = base + (chroma - base) * 6 * t;
    else if (t < 1 / 2) value = chroma;
    else if (t < 2 / 3) value = base + (chroma - base) * (2 / 3 - t) * 6;
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1 / 3)}${channel(0)}${channel(-1 / 3)}`;
}

/**
 * Shifts a color's lightness (and optionally scales its saturation) in HSL
 * space. Unlike mixing toward white, this keeps the hue vivid instead of
 * washing it out toward pastel.
 */
function adjustColor(color: string, lightnessDelta: number, saturationScale = 1): string {
  const [hue, saturation, lightness] = hexToHsl(color);
  return hslToHex(hue, Math.min(Math.max(saturation * saturationScale, 0), 1), Math.min(Math.max(lightness + lightnessDelta, 0), 1));
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
  const surfaceControl = mix(surface, ink, dark ? 0.047 + strength * 0.05 : 0.007 + strength * 0.021);
  const surfaceDrawer = mix(surface, ink, dark ? surfaceElevatedSecondaryOpacity * 0.76 : 0.022 + strength * 0.043);
  const surfacePopover = mix(surface, ink, dark ? 0.063 + strength * 0.08 : 0.012 + strength * 0.02);
  const surfaceRecessed = mix(surface, ink, dark ? 0.03 + strength * 0.03 : 0.034 + strength * 0.044);
  const surfaceSidebar = dark ? mix(surface, ink, 0.04 + strength * 0.01) : mix(surface, ink, 0.05 + (contrast - baseline) * 0.0012);
  const surfaceSidebarTranslucent = alpha(surface, dark ? 0.72 : 0.64);
  const accentControl = dark ? adjustColor(accent, 0.09 + strength * 0.02) : accent;
  const accentInk = dark ? adjustColor(accent, 0.17 + strength * 0.05, 0.92) : adjustColor(accent, -0.03);
  const dangerInk = dark ? adjustColor(semanticColors.diffRemoved, 0.11 + strength * 0.05, 0.85) : adjustColor(semanticColors.diffRemoved, -0.08, 0.92);
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
    "surface-control": surfaceControl,
    "surface-sidebar": surfaceSidebar,
    "surface-sidebar-translucent": surfaceSidebarTranslucent,
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
    accent: accentControl,
    "accent-ink": accentInk,
    "accent-focus": dark ? alpha(accentControl, 0.7 + strength * 0.1) : accentControl,
    "diff-added": semanticColors.diffAdded,
    "diff-removed": semanticColors.diffRemoved,
    "diff-removed-surface": alpha(semanticColors.diffRemoved, dark ? 0.23 : 0.15),
    "danger-ink": dangerInk,
  } as const;
}
