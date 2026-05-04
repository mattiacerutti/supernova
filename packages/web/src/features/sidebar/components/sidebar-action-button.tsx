import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {ISidebarAction} from "@/features/sidebar/types/sidebar";

interface ISidebarActionButtonProps {
  action: ISidebarAction;
  onClick?: (actionId: ISidebarAction["id"]) => void;
}

export default function SidebarActionButton(props: ISidebarActionButtonProps) {
  const {action, onClick} = props;

  const handleClick = (): void => {
    onClick?.(action.id);
  };

  return (
    <Button className="text-neutral-300 hover:bg-white/5" onClick={handleClick} size="row-sm" variant="ghost">
      <Icon className="text-neutral-400" name={action.icon} size="sm" />
      <span className="flex-1">{action.label}</span>
    </Button>
  );
}
