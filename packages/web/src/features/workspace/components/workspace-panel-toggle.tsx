import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {EMPTY_LAYOUT, useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import {cn} from "@/lib/cn";

interface WorkspacePanelToggleProps {
  readonly sessionId: string;
}

export default function WorkspacePanelToggle(props: WorkspacePanelToggleProps) {
  const {sessionId} = props;
  const open = useWorkspacePanelStore((state) => (state.layouts[sessionId] ?? EMPTY_LAYOUT).open);
  const togglePanel = useWorkspacePanelStore((state) => state.togglePanel);

  return (
    <IconButton
      className={cn("size-7 text-ink-muted", open && "bg-overlay-hover text-ink")}
      label={open ? "Hide workspace" : "Show workspace"}
      onClick={() => togglePanel(sessionId)}
      variant="primary"
    >
      <Icon name="panel-right" size="sm" />
    </IconButton>
  );
}
