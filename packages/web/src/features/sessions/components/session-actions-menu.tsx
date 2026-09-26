import {useState} from "react";
import {useLocation, useNavigate} from "@tanstack/react-router";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu, {MenuItem} from "@/components/ui/menu";
import {useArchiveSession} from "@/features/sessions/api/sidebar/archive-session";
import {useSessionPinsStore} from "@/features/sessions/stores/sidebar/session-pins-store";
import {cn} from "@/lib/cn";
import {projectIdFromPath} from "@/lib/project-paths";

interface SessionActionsMenuProps {
  readonly onRename: () => void;
  readonly triggerClassName?: string;
  readonly projectPath: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
}

/** Shares session actions between the header and sidebar. */
export default function SessionActionsMenu(props: SessionActionsMenuProps) {
  const {onRename, projectPath, sessionId, sessionTitle, triggerClassName} = props;

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const pinned = useSessionPinsStore((state) => state.pinnedSessionIds.includes(sessionId));
  const toggleSessionPinned = useSessionPinsStore((state) => state.toggleSessionPinned);
  const archiveSessionMutation = useArchiveSession();

  const handleToggleSessionPinned = (): void => {
    toggleSessionPinned(sessionId);
  };

  const handleArchiveSession = (): void => {
    archiveSessionMutation.mutate(
      {projectPath, sessionId},
      {
        onSuccess: () => {
          if (location.pathname === `/session/${sessionId}`) {
            void navigate({replace: true, search: {projectId: projectIdFromPath(projectPath)}, to: "/session/new"});
          }
        },
      }
    );
  };

  return (
    <Menu
      onOpenChange={setActionsMenuOpen}
      open={actionsMenuOpen}
      trigger={(triggerProps) => (
        <Button {...triggerProps} className={cn("size-7 text-ink-muted hover:text-ink", triggerClassName)} shape="icon" size="md" variant="ghost">
          <Icon name="more-horizontal" size="xs" />
        </Button>
      )}
      triggerLabel={`Chat actions for ${sessionTitle}`}
      sideOffset={2}
      align="start"
    >
      <MenuItem icon={<Icon name="pin" size="xs" />} onClick={handleToggleSessionPinned}>
        {pinned ? "Unpin chat" : "Pin chat"}
      </MenuItem>
      <MenuItem icon={<Icon name="edit" size="xs" />} onClick={onRename}>
        Rename chat
      </MenuItem>
      <MenuItem disabled={archiveSessionMutation.isPending} icon={<Icon name="archive" size="xs" />} onClick={handleArchiveSession}>
        Archive chat
      </MenuItem>
    </Menu>
  );
}
