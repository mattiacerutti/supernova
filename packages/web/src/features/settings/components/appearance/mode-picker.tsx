import type {DesktopTheme} from "@supernova/contracts/desktop/api";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {IconName} from "@/components/ui/icon";
import ThemePreview from "@/features/settings/components/appearance/theme-preview";
import {getAppTheme} from "@/features/settings/lib/themes";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import {cn} from "@/lib/cn";

// Overshoots the card bounds so clip-path anti-aliasing never exposes the layer beneath;
// the diagonal still crosses the visible box at 38% (top) and 62% (bottom).
const SYSTEM_SPLIT_CLIP_PATH = "polygon(150% -50%, 26% -50%, 74% 150%, 150% 150%)";

const modeOptions: ReadonlyArray<{icon: IconName; label: string; value: DesktopTheme}> = [
  {icon: "monitor", label: "System", value: "system"},
  {icon: "sun", label: "Light", value: "light"},
  {icon: "moon", label: "Dark", value: "dark"},
];

export default function ModePicker() {
  const mode = useAppearanceStore((state) => state.mode);
  const setMode = useAppearanceStore((state) => state.setMode);
  const themeId = useAppearanceStore((state) => state.themeId);
  const theme = getAppTheme(themeId);

  return (
    <div aria-label="Color mode" className="grid grid-cols-3 gap-3" role="radiogroup">
      {modeOptions.map((option) => {
        const active = option.value === mode;

        return (
          <Button aria-checked={active} className="group flex w-full flex-col gap-2" key={option.value} onClick={() => setMode(option.value)} role="radio">
            <div
              className={cn(
                "relative aspect-[16/10] w-full overflow-hidden rounded-xl corner-superellipse/1.3 transition-shadow",
                active ? "ring-2 ring-accent" : "ring-1 ring-border group-hover:ring-border-strong"
              )}
            >
              <ThemePreview variant={option.value === "dark" ? theme.dark : theme.light} />
              {option.value === "system" && (
                <div className="absolute inset-0" style={{clipPath: SYSTEM_SPLIT_CLIP_PATH}}>
                  <ThemePreview variant={theme.dark} />
                </div>
              )}
            </div>
            <span className={cn("flex items-center gap-1.5 text-xs transition-colors", active ? "text-ink" : "text-ink-muted group-hover:text-ink")}>
              <Icon name={option.icon} size="xs" />
              {option.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
