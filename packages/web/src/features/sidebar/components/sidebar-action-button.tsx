import Button, {type IButtonProps} from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {ISidebarAction} from "@/features/sidebar/types/sidebar";
import {cn} from "@/lib/cn";

interface ISidebarActionButtonProps extends Omit<IButtonProps, "children" | "onClick"> {
  action: ISidebarAction;
  onClick?: (actionId: ISidebarAction["id"]) => void;
}

export default function SidebarActionButton(props: ISidebarActionButtonProps) {
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
