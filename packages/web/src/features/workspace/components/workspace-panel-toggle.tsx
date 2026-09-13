import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import {cn} from "@/lib/cn";

export default function WorkspacePanelToggle() {
  const open = useWorkspacePanelStore((state) => state.open);
  const togglePanel = useWorkspacePanelStore((state) => state.togglePanel);

  return (
    <IconButton
      className={cn("size-7 text-ink-muted", open && "bg-overlay-hover text-ink")}
      label={open ? "Hide workspace" : "Show workspace"}
      onClick={togglePanel}
      variant="primary"
    >
      <Icon name="panel-right" size="sm" />
    </IconButton>
  );
}
