import type {CSSProperties} from "react";
import Button from "@/components/ui/button";
import {appThemes} from "@/features/settings/lib/themes";
import type {ThemeVariant} from "@/features/settings/lib/themes";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import {cn} from "@/lib/cn";

interface TileSpec {
  accentMid: string;
  accentPeak: string;
  base: string;
  inkGlow: string;
  inkSheen: string;
}

const TILE_SPECS: Record<ThemeVariant["variant"], TileSpec> = {
  dark: {accentMid: "22%", accentPeak: "45%", base: "#09090b", inkGlow: "13%", inkSheen: "7%"},
  light: {accentMid: "26%", accentPeak: "50%", base: "#ffffff", inkGlow: "9%", inkSheen: "5%"},
};

function tint(color: string, opacity: string): string {
  return `color-mix(in oklab, ${color} ${opacity}, transparent)`;
}

function getTileFillStyle(variant: ThemeVariant): CSSProperties {
  const spec = TILE_SPECS[variant.variant];
  const {accent, ink, surface} = variant.theme;

  return {
    backgroundColor: `color-mix(in oklab, ${surface} 92%, ${spec.base})`,
    backgroundImage: [
      `radial-gradient(circle at 86% 86% in oklab, ${tint(accent, spec.accentPeak)} 0%, ${tint(accent, spec.accentMid)} 18%, transparent 42%)`,
      `radial-gradient(circle at 18% 8% in oklab, ${tint(ink, spec.inkGlow)} 0%, transparent 85%)`,
      `radial-gradient(circle at 55% 60% in oklab, ${tint(ink, spec.inkSheen)} 0%, transparent 75%)`,
    ].join(", "),
    filter: "blur(18px)",
    transform: "scale(1.3)",
  };
}

export default function ThemeLibrary() {
  const resolvedMode = useAppearanceStore((state) => state.resolvedMode);
  const setThemeId = useAppearanceStore((state) => state.setThemeId);
  const themeId = useAppearanceStore((state) => state.themeId);

  return (
    <div aria-label="Color palette" className="grid grid-cols-3 gap-3" role="radiogroup">
      {appThemes.map((theme) => {
        const active = theme.id === themeId;
        const variant = resolvedMode === "dark" ? theme.dark : theme.light;

        return (
          <Button aria-checked={active} className="group flex w-full flex-col gap-2" key={theme.id} onClick={() => setThemeId(theme.id)} role="radio">
            <span
              className={cn(
                "relative block aspect-[16/10] w-full overflow-hidden rounded-xl corner-superellipse/1.3 transition-shadow",
                active ? "ring-2 ring-accent" : "ring-1 ring-border group-hover:ring-border-strong"
              )}
            >
              <span className="absolute inset-0" style={getTileFillStyle(variant)} />
            </span>
            <span className={cn("text-xs transition-colors", active ? "text-ink" : "text-ink-muted group-hover:text-ink")}>{theme.name}</span>
          </Button>
        );
      })}
    </div>
  );
}
