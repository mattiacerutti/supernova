import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import type {MouseEvent} from "react";
import {useState} from "react";
import SidebarActionButton from "@/features/sidebar/components/sidebar-action-button";
import OpenProjectDialog from "@/features/projects/components/open-project-dialog";
import ProjectListItem from "@/features/projects/components/project-list-item";
import {useProjectList} from "@/features/projects/hooks/use-project-list";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";
import {useSidebarSections} from "@/features/sidebar/hooks/use-sidebar-sections";
import type {SidebarActionId} from "@/features/sidebar/types/sidebar";
import {sidebarActions} from "@/features/sidebar/stores/sidebar-store";

export default function Sidebar() {
  const {expandProject, expandedProjects, isPinnedCollapsed, isProjectsCollapsed, togglePinnedCollapsed, toggleProject, toggleProjectsCollapsed} = useSidebarSections();

  const projects = useProjectList();
  const pinnedProjects = projects.filter((project) => project.pinned);
  const regularProjects = projects.filter((project) => !project.pinned);

  const [openProjectDialogOpen, setOpenProjectDialogOpen] = useState(false);

  // We need the parent to control the state of the dialog to reset it when opening.
  const [openProjectPath, setOpenProjectPath] = useState("");
  const [openProjectActiveSuggestionIndex, setOpenProjectActiveSuggestionIndex] = useState(0);

  const addProject = useProjectsStore((state) => state.addProject);

  const handleProjectsActionClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  const handleOpenProjectDialog = (): void => {
    setOpenProjectPath("");
    setOpenProjectActiveSuggestionIndex(0);
    setOpenProjectDialogOpen(true);
  };

  const handleCloseProjectDialog = (): void => {
    setOpenProjectDialogOpen(false);
  };

  const handleSidebarActionClick = (actionId: SidebarActionId): void => {
    if (actionId === "new-project") {
      handleOpenProjectDialog();
    }
  };

  const handleOpenProject = (projectPath: string): void => {
    const project = addProject(projectPath);
    if (project) {
      expandProject(project.id);
    }
    setOpenProjectDialogOpen(false);
  };

  return (
    <aside className="flex h-svh w-full shrink-0 flex-col pt-14 md:w-72">
      <div className="space-y-0.5 px-3 pb-4 pt-1">
        {sidebarActions.map((action) => (
          <SidebarActionButton action={action} key={action.id} onClick={handleSidebarActionClick} />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {pinnedProjects.length > 0 && (
          <div>
            <Button className="group/pinned mb-2 flex h-6 w-full items-center justify-between px-2 text-neutral-500" onClick={togglePinnedCollapsed} variant="bare">
              <div className="flex items-center gap-1.5 text-left text-sm">
                <span>Pinned</span>
                <Icon className={cn("opacity-0 group-hover/pinned:opacity-100", isPinnedCollapsed && "-rotate-90")} name="chevron-down" size="sm" />
              </div>
            </Button>

            <div className="sidebar-collapse" data-expanded={!isPinnedCollapsed}>
              <ul className="overflow-hidden pb-3">
                {pinnedProjects.map((project) => (
                  <ProjectListItem expanded={expandedProjects.has(project.id)} key={project.id} onToggle={toggleProject} project={project} />
                ))}
              </ul>
            </div>
          </div>
        )}

        <Button className="group/projects mb-2 flex h-6 w-full items-center justify-between px-2 text-neutral-500" onClick={toggleProjectsCollapsed} variant="bare">
          <div className="flex items-center gap-1.5 text-left text-sm">
            <span>Projects</span>
            <Icon className={cn("opacity-0 group-hover/projects:opacity-100", isProjectsCollapsed && "-rotate-90")} name="chevron-down" size="sm" />
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover/projects:opacity-100" onClick={handleProjectsActionClick}>
            <IconButton className="size-6" label="Expand projects">
              <Icon name="maximize" size="sm" />
            </IconButton>
            <IconButton className="size-6" label="Filter projects">
              <Icon name="filter" size="sm" />
            </IconButton>
            <IconButton className="size-6" label="New project" onClick={handleOpenProjectDialog}>
              <Icon name="folder-plus" size="sm" />
            </IconButton>
          </div>
        </Button>

        <div className="sidebar-collapse" data-expanded={!isProjectsCollapsed}>
          <ul className="overflow-hidden">
            {regularProjects.length === 0 && <li className="px-2 py-1 text-sm text-neutral-600">Add a project to get started.</li>}
            {regularProjects.map((project) => (
              <ProjectListItem expanded={expandedProjects.has(project.id)} key={project.id} onToggle={toggleProject} project={project} />
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <Button className="text-neutral-300 hover:text-white" size="sm" variant="primary">
          <Icon name="settings" size="sm" />
          <span>Settings</span>
        </Button>
      </div>
      <OpenProjectDialog
        activeSuggestionIndex={openProjectActiveSuggestionIndex}
        onActiveSuggestionIndexChange={setOpenProjectActiveSuggestionIndex}
        projectPath={openProjectPath}
        onProjectPathChange={setOpenProjectPath}
        onClose={handleCloseProjectDialog}
        onOpenProject={handleOpenProject}
        open={openProjectDialogOpen}
      />
    </aside>
  );
}
