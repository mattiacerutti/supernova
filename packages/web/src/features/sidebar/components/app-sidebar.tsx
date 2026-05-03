import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import type {MouseEvent} from "react";
import SidebarActionButton from "@/features/sidebar/components/sidebar-action-button";
import ProjectTreeItem from "@/features/sidebar/components/project-tree-item";
import {cn} from "@/lib/cn";
import {useSidebarProjects} from "@/features/sidebar/hooks/use-sidebar-projects";

export default function AppSidebar() {
  const {actions, error, expandedProjectIds, isLoading, projects, projectsCollapsed, toggleProject, toggleProjectsCollapsed} = useSidebarProjects();

  const handleProjectsActionClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  return (
    <aside className="flex h-svh w-full shrink-0 flex-col pt-14 md:w-72">
      <div className="space-y-0.5 px-3 pb-4 pt-1">
        {actions.map((action) => (
          <SidebarActionButton action={action} key={action.id} />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <Button className="group/projects mb-2 flex items-center justify-between px-2 text-zinc-500 w-full" onClick={toggleProjectsCollapsed} variant="bare">
          <div className="flex items-center gap-1.5 text-left text-sm">
            <span>Projects</span>
            <Icon className={cn("opacity-0 group-hover/projects:opacity-100", projectsCollapsed && "-rotate-90")} name="chevron-down" size="sm" />
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover/projects:opacity-100" onClick={handleProjectsActionClick}>
            <IconButton className="size-6" label="Expand projects">
              <Icon name="maximize" size="sm" />
            </IconButton>
            <IconButton className="size-6" label="Filter projects">
              <Icon name="filter" size="sm" />
            </IconButton>
            <IconButton className="size-6" label="New project">
              <Icon name="folder-plus" size="sm" />
            </IconButton>
          </div>
        </Button>

        <div className="sidebar-collapse" data-expanded={!projectsCollapsed}>
          <ul className="overflow-hidden">
            {isLoading && <li className="px-2 py-1 text-sm text-zinc-600">Loading projects...</li>}
            {error && <li className="px-2 py-1 text-sm text-red-400">Unable to load projects.</li>}
            {!isLoading && !error && projects.length === 0 && <li className="px-2 py-1 text-sm text-zinc-600">No Pi chats found.</li>}
            {projects.map((project) => (
              <ProjectTreeItem expanded={expandedProjectIds.has(project.id)} key={project.id} onToggle={toggleProject} project={project} />
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <Button className="text-zinc-300 hover:text-white" size="row-sm" variant="plain">
          <Icon name="settings" size="sm" />
          <span>Settings</span>
        </Button>
      </div>
    </aside>
  );
}
