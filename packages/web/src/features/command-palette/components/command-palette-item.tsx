import type {ReactNode, Ref} from "react";
import Icon from "@/components/ui/icon";
import type {IconName} from "@/components/ui/icon";
import {cn} from "@/lib/cn";

/** What `CommandPaletteList` hands each row so it highlights and selects like every other row; spread it onto the item. */
export interface CommandPaletteItemState {
  readonly highlighted: boolean;
  readonly onSelect: () => void;
  readonly ref: Ref<HTMLDivElement>;
}

interface CommandPaletteItemProps extends CommandPaletteItemState {
  readonly children: ReactNode;
  /** Secondary context after the title, such as a session's project. */
  readonly detail?: ReactNode;
  readonly icon: IconName;
  /** Right-aligned content, such as a timestamp or a chevron for items that open a page. */
  readonly trailing?: ReactNode;
}

/** A selectable palette row: an icon, a title, optional detail, and optional trailing content. */
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
