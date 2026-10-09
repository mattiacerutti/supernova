import {useNavigate} from "@tanstack/react-router";
import type {MouseEvent} from "react";
import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuItem} from "@/components/ui/menu";
import {isMacEnvironment} from "@/config/app-environment";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {Project} from "@/features/projects/types/project";
import SidebarProjectSessions from "@/features/sessions/components/sidebar/sidebar-project-sessions";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {cn} from "@/lib/cn";

interface ProjectListItemProps {
  readonly activeSessionId: string;
  readonly dragging: boolean;
  readonly expanded: boolean;
  readonly onToggle: (projectId: string) => void;
  readonly project: Project;
}

export default function ProjectListItem(props: ProjectListItemProps) {
  const {activeSessionId, dragging, expanded, onToggle, project} = props;

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const removeProject = useProjectsStore((state) => state.removeProject);
  const renameProject = useProjectsStore((state) => state.renameProject);
  const toggleProjectPinned = useProjectsStore((state) => state.toggleProjectPinned);
  const {inputProps, renaming, startRenaming} = useInlineRename({initialValue: project.name, onSave: (name) => renameProject(project.id, name)});

  const handleToggle = (): void => {
    onToggle(project.id);
  };

  const handleRemoveProject = (): void => {
    removeProject(project.id);
  };

  const handleToggleProjectPinned = (): void => {
    toggleProjectPinned(project.id);
  };

  const handleNewSession = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    void navigate({search: {projectId: project.id}, to: "/session/new"});
  };

  const handleOpenInFinder = (): void => {
    void window.desktopApi?.openDirectory(project.path);
  };

  return (
    <>
      <Button
        as="div"
        className={cn("group flex w-full justify-between items-center gap-2 pl-2 pr-1 py-0.5 text-ink-muted hover:text-ink", actionsMenuOpen && "bg-overlay-hover")}
        onClick={handleToggle}
        variant="primary"
      >
        <div className="flex min-w-0 flex-1 flex-row gap-2 items-center">
          <Icon className="text-ink-muted" name={expanded ? "folder-open" : "folder"} size="sm" />
          {renaming ? (
            <input {...inputProps} className="min-w-0 flex-1 truncate bg-transparent text-sm text-ink-muted outline-none" />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <div className={cn("opacity-0 group-hover:opacity-100", actionsMenuOpen && "opacity-100")}>
            <Menu
              onOpenChange={setActionsMenuOpen}
              open={actionsMenuOpen}
              trigger={(triggerProps) => (
                <Button {...triggerProps} className="size-7" shape="icon" size="md" variant="ghost">
                  <Icon name="more-horizontal" size="xs" />
                </Button>
              )}
              triggerLabel={`Project actions for ${project.name}`}
              sideOffset={2}
            >
              <MenuItem icon={<Icon name="pin" size="xs" />} onClick={handleToggleProjectPinned}>
                {project.pinned ? "Unpin project" : "Pin project"}
              </MenuItem>
              {isMacEnvironment && (
                <MenuItem icon={<Icon name="folder-open" size="xs" />} onClick={handleOpenInFinder}>
                  Open in Finder
                </MenuItem>
              )}
              <MenuItem icon={<Icon name="edit" size="xs" />} onClick={startRenaming}>
                Rename project
              </MenuItem>
              <MenuItem icon={<Icon name="x" size="xs" />} onClick={handleRemoveProject}>
                Remove
              </MenuItem>
            </Menu>
          </div>
          <IconButton className="size-7" label={`New session in ${project.name}`} onClick={handleNewSession}>
            <Icon name="new-session" size="xs" />
          </IconButton>
        </div>
      </Button>

      <SidebarProjectSessions activeSessionId={activeSessionId} collapsed={!expanded && dragging} expanded={expanded} projectPath={project.path} />
    </>
  );
}
