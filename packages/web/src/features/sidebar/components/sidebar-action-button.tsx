import Button, {type ButtonProps} from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {SidebarAction} from "@/features/sidebar/types/sidebar";
import {cn} from "@/lib/cn";

interface SidebarActionButtonProps extends Omit<ButtonProps, "children" | "onClick"> {
  action: SidebarAction;
  onClick?: (actionId: SidebarAction["id"]) => void;
}

export default function SidebarActionButton(props: SidebarActionButtonProps) {
  const {action, className, onClick, size = "sm", variant = "primary", ...buttonProps} = props;

  const handleClick = (): void => {
    onClick?.(action.id);
  };

  return (
    <Button className={cn("gap-2", className)} onClick={handleClick} size={size} variant={variant} {...buttonProps}>
      <Icon className="text-neutral-400" name={action.icon} size="sm" />
      <span className="flex-1">{action.label}</span>
    </Button>
  );
}
