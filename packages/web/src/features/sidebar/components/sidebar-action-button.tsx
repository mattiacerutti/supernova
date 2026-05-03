import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {ISidebarAction} from "@/features/sidebar/types/sidebar";

interface ISidebarActionButtonProps {
  action: ISidebarAction;
}

export default function SidebarActionButton(props: ISidebarActionButtonProps) {
  const {action} = props;

  return (
    <Button className="text-zinc-300 hover:bg-white/5" size="row-sm" variant="ghost">
      <Icon className="text-zinc-400" name={action.icon} size="sm" />
      <span className="flex-1">{action.label}</span>
    </Button>
  );
}
