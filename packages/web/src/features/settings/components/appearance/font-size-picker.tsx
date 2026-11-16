import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu, {MenuItem} from "@/components/ui/menu";
import {DEFAULT_FONT_SIZES, FONT_SIZE_OPTIONS, useSettingsStore} from "@/stores/settings-store";
import type {FontSizeTarget} from "@/stores/settings-store";

interface FontSizePickerProps {
  readonly label: string;
  readonly target: FontSizeTarget;
}

export default function FontSizePicker(props: FontSizePickerProps) {
  const {label, target} = props;
  const size = useSettingsStore((state) => state.fontSizes[target]);
  const setFontSize = useSettingsStore((state) => state.setFontSize);

  return (
    <Menu
      className="max-h-72 overflow-y-auto"
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="w-auto shrink-0 px-3 py-1.5 text-xs" size="sm" variant="filled">
          {size} px{size === DEFAULT_FONT_SIZES[target] && " (default)"}
          <Icon name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel={label}
    >
      {FONT_SIZE_OPTIONS.map((option) => (
        <MenuItem key={option} onClick={() => setFontSize(target, option)} trailing={size === option && <Icon name="check" size="xs" />}>
          {option} px{option === DEFAULT_FONT_SIZES[target] && " (default)"}
        </MenuItem>
      ))}
    </Menu>
  );
}
