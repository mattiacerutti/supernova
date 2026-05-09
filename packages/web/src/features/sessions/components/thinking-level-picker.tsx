import type {IAgentThinkingLevelOption} from "@pi-desktop/contracts/sessions";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu, {MenuItem} from "@/components/ui/menu";

interface IThinkingLevelPickerProps {
  disabled: boolean;
  onThinkingLevelChange: (value: string) => void;
  selectedThinkingLabel: string;
  selectedThinkingLevel: string | undefined;
  thinkingLevels: readonly IAgentThinkingLevelOption[];
}

export default function ThinkingLevelPicker(props: IThinkingLevelPickerProps) {
  const {disabled, onThinkingLevelChange, selectedThinkingLabel, selectedThinkingLevel, thinkingLevels} = props;

  return (
    <Menu
      align="end"
      className="w-40 rounded-2xl pt-3"
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          className="flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-neutral-500 transition hover:bg-white/5 disabled:cursor-default disabled:opacity-50"
          disabled={disabled || thinkingLevels.length === 0}
          type="button"
        >
          <span className="truncate">{selectedThinkingLabel}</span>
          <Icon className="shrink-0 text-neutral-500" name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel="Select reasoning level"
    >
      <div className="px-2 pb-2 text-sm text-neutral-500">Thinking Level</div>
      <div className="space-y-1">
        {thinkingLevels.map((level) => {
          const selected = level.value === selectedThinkingLevel;

          return (
            <MenuItem key={level.value} onClick={() => onThinkingLevelChange(level.value)} trailing={selected && <Icon name="check" size="sm" />}>
              {level.label}
            </MenuItem>
          );
        })}
      </div>
    </Menu>
  );
}
