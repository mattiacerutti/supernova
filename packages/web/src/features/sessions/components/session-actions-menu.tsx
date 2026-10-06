import {useState} from "react";
import {useLocation, useNavigate} from "@tanstack/react-router";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu, {MenuItem} from "@/components/ui/menu";
import {useArchiveSession} from "@/features/sessions/api/sidebar/archive-session";
import ArchiveWorktreeSessionDialog from "@/features/sessions/components/sidebar/archive-worktree-session-dialog";
import {useSessionPinsStore} from "@/features/sessions/stores/sidebar/session-pins-store";
import {cn} from "@/lib/cn";
import {projectIdFromPath} from "@/lib/project-paths";

interface SessionActionsMenuProps {
  /** Called when the menu opens or closes, for callers that hide competing UI while it is open. */
  readonly onOpenChange?: (open: boolean) => void;
  readonly onRename: () => void;
  readonly triggerClassName?: string;
  readonly projectPath: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
  /** Whether the session runs in its own worktree; archiving then asks about removing it. */
  readonly worktree: boolean;
}

/** Shares session actions between the header and sidebar. */
export default function SessionActionsMenu(props: SessionActionsMenuProps) {
  const {onOpenChange, onRename, projectPath, sessionId, sessionTitle, triggerClassName, worktree} = props;

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const pinned = useSessionPinsStore((state) => state.pinnedSessionIds.includes(sessionId));
  const toggleSessionPinned = useSessionPinsStore((state) => state.toggleSessionPinned);
  const archiveSessionMutation = useArchiveSession();

  const handleToggleSessionPinned = (): void => {
    toggleSessionPinned(sessionId);
  };

  const handleActionsMenuOpenChange = (open: boolean): void => {
    setActionsMenuOpen(open);
    onOpenChange?.(open);
  };

  const archiveSession = (removeWorktree: boolean): void => {
    setArchiveDialogOpen(false);
    archiveSessionMutation.mutate(
      {projectPath, removeWorktree, sessionId},
      {
        onSuccess: () => {
          if (location.pathname === `/session/${sessionId}`) {
            void navigate({replace: true, search: {projectId: projectIdFromPath(projectPath)}, to: "/session/new"});
          }
        },
      }
    );
  };

  const handleArchiveSession = (): void => {
    if (worktree) setArchiveDialogOpen(true);
    else archiveSession(false);
  };

  return (
    <>
      <ArchiveWorktreeSessionDialog onArchive={archiveSession} onCancel={() => setArchiveDialogOpen(false)} open={archiveDialogOpen} />
      <Menu
        onOpenChange={handleActionsMenuOpenChange}
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
    </>
  );
}
