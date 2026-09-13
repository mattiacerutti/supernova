import type {ReactNode} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

interface PanelSectionHeaderProps {
  readonly actions?: ReactNode;
  readonly collapsed: boolean;
  readonly label: string;
  readonly onToggle: () => void;
  readonly trailing?: ReactNode;
}

export default function PanelSectionHeader(props: PanelSectionHeaderProps) {
  const {actions, collapsed, label, onToggle, trailing} = props;

  return (
    <div className="group/section flex h-8 w-full shrink-0 items-center justify-between gap-2 px-3">
      <Button aria-expanded={!collapsed} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink-muted hover:text-ink" onClick={onToggle} variant="bare">
        <Icon className={cn("text-ink-faint transition-transform duration-160 ease-out", collapsed && "-rotate-90")} name="chevron-down" size="xs" />
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm">{label}</span>
          {trailing}
        </span>
      </Button>

      {actions && <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-160 ease-out group-hover/section:opacity-100">{actions}</div>}
    </div>
  );
}
