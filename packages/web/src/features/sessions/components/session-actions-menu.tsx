import {useState} from "react";
import {useNavigate} from "@tanstack/react-router";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Menu, {MenuItem} from "@/components/ui/menu";
import {useArchiveProjectSession} from "@/features/projects/hooks/api/use-archive-project-session";
import {useProjectsStore} from "@/features/projects/stores/projects-store";

interface SessionActionsMenuProps {
  readonly onRename: () => void;
  readonly projectPath: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
}

export default function SessionActionsMenu(props: SessionActionsMenuProps) {
  const {onRename, projectPath, sessionId, sessionTitle} = props;

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const project = useProjectsStore((state) => state.projects.find((candidate) => candidate.path === projectPath));
  const toggleSessionPinned = useProjectsStore((state) => state.toggleSessionPinned);
  const archiveProjectSessionMutation = useArchiveProjectSession();
  const pinned = project?.pinnedSessionIds?.includes(sessionId) === true;

  const handleToggleSessionPinned = (): void => {
    if (!project) return;
    toggleSessionPinned(project.id, sessionId);
  };

  const handleArchiveSession = (): void => {
    archiveProjectSessionMutation.mutate(
      {projectPath, sessionId},
      {
        onSuccess: () => {
          void navigate({replace: true, search: project ? {projectId: project.id} : {}, to: "/session/new"});
        },
      }
    );
  };

  return (
    <Menu
      onOpenChange={setActionsMenuOpen}
      open={actionsMenuOpen}
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="size-7 text-neutral-500 hover:text-neutral-300" shape="icon" size="md" variant="ghost">
          <Icon name="more-horizontal" size="xs" />
        </Button>
      )}
      triggerLabel={`Chat actions for ${sessionTitle}`}
      sideOffset={2}
      align="start"
    >
      <MenuItem disabled={!project} icon={<Icon name="pin" size="xs" />} onClick={handleToggleSessionPinned}>
        {pinned ? "Unpin chat" : "Pin chat"}
      </MenuItem>
      <MenuItem icon={<Icon name="edit" size="xs" />} onClick={onRename}>
        Rename chat
      </MenuItem>
      <MenuItem disabled={archiveProjectSessionMutation.isPending} icon={<Icon name="archive" size="xs" />} onClick={handleArchiveSession}>
        Archive chat
      </MenuItem>
    </Menu>
  );
}
