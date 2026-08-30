import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu from "@/components/ui/menu";
import SearchField from "@/components/ui/search-field";
import {appThemes, getAppTheme} from "@/features/settings/lib/themes";
import type {ThemeId, ThemeVariant} from "@/features/settings/lib/themes";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import {cn} from "@/lib/cn";

interface ThemeSwatchProps {
  variant: ThemeVariant;
}

function ThemeSwatch(props: ThemeSwatchProps) {
  const {variant} = props;

  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center rounded-md border border-border-muted text-xs font-medium"
      style={{backgroundColor: variant.theme.surface, color: variant.theme.ink}}
    >
      Aa
    </span>
  );
}

export default function ThemePicker() {
  const resolvedMode = useAppearanceStore((state) => state.resolvedMode);
  const setThemeId = useAppearanceStore((state) => state.setThemeId);
  const themeId = useAppearanceStore((state) => state.themeId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedTheme = getAppTheme(themeId);
  const searchQuery = search.trim().toLowerCase();
  const matchingThemes = appThemes.filter((theme) => theme.name.toLowerCase().includes(searchQuery));

  const variantOf = (theme: (typeof appThemes)[number]): ThemeVariant => (resolvedMode === "dark" ? theme.dark : theme.light);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) setSearch("");
    setOpen(nextOpen);
  };

  const handleThemeSelect = (nextThemeId: ThemeId): void => {
    setThemeId(nextThemeId);
    setOpen(false);
  };

  return (
    <Menu
      align="end"
      className="w-56 p-0"
      onOpenChange={handleOpenChange}
      open={open}
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised/70 px-2.5 py-1.5 text-sm text-ink hover:border-border-strong sm:w-44"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ThemeSwatch variant={variantOf(selectedTheme)} />
            <span className="truncate">{selectedTheme.name}</span>
          </span>
          <Icon className="shrink-0 text-ink-muted" name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel="Theme"
    >
      <SearchField
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="Search themes"
        value={search}
      />

      <div className="scroll-fade-b max-h-60 overflow-y-auto p-1 [overflow-anchor:none]">
        {matchingThemes.length === 0 && <div className="px-3 py-6 text-center text-sm text-ink-muted">No themes found</div>}
        <div className="space-y-0.5">
          {matchingThemes.map((theme) => {
            const selected = theme.id === themeId;

            return (
              <Button
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl corner-superellipse/1.3 px-2 py-1.5 text-left transition-colors hover:bg-overlay-pressed"
                key={theme.id}
                onClick={() => handleThemeSelect(theme.id)}
                variant="bare"
              >
                <ThemeSwatch variant={variantOf(theme)} />
                <span className={cn("min-w-0 flex-1 truncate text-sm leading-5 text-ink", selected && "font-medium")}>{theme.name}</span>
                {selected && <Icon className="shrink-0 text-ink" name="check" size="xs" />}
              </Button>
            );
          })}
        </div>
      </div>
    </Menu>
  );
}
