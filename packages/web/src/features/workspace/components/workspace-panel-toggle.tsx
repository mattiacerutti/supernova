import {formatForDisplay, useHotkey} from "@tanstack/react-hotkeys";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {EMPTY_LAYOUT, useWorkspacePanelStore, WORKSPACE_PANEL_HOTKEY} from "@/features/workspace/stores/workspace-panel-store";
import {cn} from "@/lib/cn";

interface WorkspacePanelToggleProps {
  readonly sessionId: string;
}

export default function WorkspacePanelToggle(props: WorkspacePanelToggleProps) {
  const {sessionId} = props;
  const open = useWorkspacePanelStore((state) => (state.layouts[sessionId] ?? EMPTY_LAYOUT).open);
  const togglePanel = useWorkspacePanelStore((state) => state.togglePanel);
  const label = open ? "Hide workspace" : "Show workspace";

  // Registered here because the toggle is rendered exactly when a session page is: the panel belongs to that session.
  useHotkey(WORKSPACE_PANEL_HOTKEY, () => togglePanel(sessionId));

  return (
    <IconButton
      className={cn("size-7 text-ink-muted", open && "bg-overlay-hover text-ink")}
      label={label}
      onClick={() => togglePanel(sessionId)}
      title={`${label} (${formatForDisplay(WORKSPACE_PANEL_HOTKEY)})`}
      variant="primary"
    >
      <Icon name="panel-right" size="sm" />
    </IconButton>
  );
}
