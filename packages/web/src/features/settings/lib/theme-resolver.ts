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
      readonly skill: string;
    };
    readonly surface: string;
  };
  readonly variant: "dark" | "light";
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(first: string, second: string, amount: number): string {
  const from = hexToRgb(first);
  const to = hexToRgb(second);
  const channel = (index: number) => Math.round(from[index]! + (to[index]! - from[index]!) * Math.min(Math.max(amount, 0), 1));
  return `#${channel(0).toString(16).padStart(2, "0")}${channel(1).toString(16).padStart(2, "0")}${channel(2).toString(16).padStart(2, "0")}`;
}

function alpha(color: string, opacity: number): string {
  const [red, green, blue] = hexToRgb(color);
  return `rgb(${red} ${green} ${blue} / ${opacity})`;
}

/** Resolves compact theme seeds into the runtime colors consumed by the UI. */
export function resolveTheme(variant: ThemeVariant) {
  const {accent, contrast, ink, semanticColors, surface} = variant.theme;
  const strength = Math.min(Math.max(contrast / 100, 0), 1);
  const dark = variant.variant === "dark";
  const surfaceDeep = dark ? mix(surface, "#000000", strength * 1.1) : mix(surface, ink, strength * 0.07);
  const surfaceRaised = mix(surface, ink, strength * 0.12);
  const surfaceInset = dark ? mix(surface, "#000000", strength * 0.06) : mix(surface, ink, strength * 0.04);

  return {
    surface: surface,
    "surface-deep": surfaceDeep,
    "surface-raised": surfaceRaised,
    "surface-inset": surfaceInset,
    "surface-contrast": dark ? surfaceRaised : surface,
    "surface-recessed": dark ? surfaceInset : surfaceRaised,
    ink: mix(ink, surface, 0.09),
    "ink-strong": ink,
    "ink-muted": mix(ink, surface, dark ? 0.5 : 0.45),
    "ink-faint": mix(ink, surface, dark ? 0.72 : 0.65),
    "ink-inverse": surfaceDeep,
    border: alpha(ink, 0.1),
    "border-muted": alpha(ink, 0.07),
    "border-strong": alpha(ink, 0.22),
    "overlay-hover": alpha(ink, 0.06),
    "overlay-pressed": alpha(ink, 0.1),
    "overlay-strong": alpha(ink, 0.15),
    "overlay-scrim": alpha("#000000", dark ? 0.55 : 0.35),
    accent,
    "diff-added": semanticColors.diffAdded,
    "diff-removed": semanticColors.diffRemoved,
    "diff-removed-surface": alpha(semanticColors.diffRemoved, dark ? 0.3 : 0.2),
    skill: semanticColors.skill,
  } as const;
}
