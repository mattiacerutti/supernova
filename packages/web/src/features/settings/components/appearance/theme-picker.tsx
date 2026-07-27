import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu, {MenuItem} from "@/components/ui/menu";
import {appThemes, getAppTheme} from "@/features/settings/data/app-themes";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";

const preview = <span className="grid size-5 place-items-center rounded-md border border-border bg-surface-inset text-xs text-accent">Aa</span>;

/** Selects the active app theme. */
export default function ThemePicker() {
  const themeId = useAppearanceStore((state) => state.themeId);
  const setThemeId = useAppearanceStore((state) => state.setThemeId);
  const theme = getAppTheme(themeId);

  return (
    <Menu
      align="end"
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          className="inline-flex w-40 items-center justify-between rounded-xl border border-border bg-surface-raised/70 px-2.5 py-1.5 text-sm text-ink hover:border-border-strong"
        >
          <span className="flex min-w-0 items-center gap-2">
            {preview}
            <span className="truncate">{theme.name}</span>
          </span>
          <Icon name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel="Theme"
    >
      {appThemes.map((option) => (
        <MenuItem icon={preview} key={option.id} onClick={() => setThemeId(option.id)} trailing={themeId === option.id ? <Icon name="check" size="xs" /> : undefined}>
          {option.name}
        </MenuItem>
      ))}
    </Menu>
  );
}
