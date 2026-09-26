import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu, {MenuItem, MenuLabel} from "@/components/ui/menu";
import {useComposerContext} from "@/features/sessions/hooks/composer/use-composer";

/** Picks the thinking level of the selected model. Renders nothing for models without levels. */
export default function ThinkingLevelPicker() {
  const {disabled, models} = useComposerContext();
  const thinkingLevels = models.selectedModelDetails?.thinkingLevels ?? [];
  const selectedThinkingLevel = models.modelReference?.thinkingLevel;

  if (thinkingLevels.length === 0) return null;

  return (
    <Menu
      align="end"
      className="w-40"
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="flex min-w-0 items-center gap-1.5  px-2.5 py-1 text-xs" disabled={disabled} type="button" variant="primary">
          <span className="truncate">{models.selectedThinkingLabel}</span>
          <Icon className="shrink-0 text-ink-muted" name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel="Select reasoning level"
    >
      <MenuLabel>Thinking level</MenuLabel>
      <div className="space-y-0.5">
        {thinkingLevels.map((level) => {
          const selected = level.value === selectedThinkingLevel;

          return (
            <MenuItem key={level.value} onClick={() => models.selectThinkingLevel(level.value)} trailing={selected && <Icon name="check" size="xs" />}>
              {level.label}
            </MenuItem>
          );
        })}
      </div>
    </Menu>
  );
}
