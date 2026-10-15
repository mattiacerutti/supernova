import type {ReactNode, Ref} from "react";
import Icon from "@/components/ui/icon";
import type {IconName} from "@/components/ui/icon";
import {cn} from "@/lib/cn";

export interface CommandPaletteItemState {
  readonly highlighted: boolean;
  readonly onSelect: () => void;
  readonly ref: Ref<HTMLDivElement>;
}

interface CommandPaletteItemProps extends CommandPaletteItemState {
  readonly children: ReactNode;
  readonly detail?: ReactNode;
  readonly icon: IconName;
  readonly trailing?: ReactNode;
}

export default function CommandPaletteItem(props: CommandPaletteItemProps) {
  const {children, detail, highlighted, icon, onSelect, ref, trailing} = props;

  return (
    <div className={cn("flex cursor-pointer items-center gap-3 rounded-xl corner-superellipse/1.3 px-3 py-2", highlighted && "bg-overlay-hover")} onClick={onSelect} ref={ref}>
      <Icon className="shrink-0 text-ink-muted" name={icon} size="sm" />
      <span className="min-w-0 truncate text-[15px] text-ink">{children}</span>
      {detail && <span className="min-w-0 max-w-1/3 shrink-0 truncate text-sm text-ink-faint">{detail}</span>}
      {trailing && <span className="ml-auto flex shrink-0 items-center pl-2 text-xs text-ink-muted">{trailing}</span>}
    </div>
  );
}
