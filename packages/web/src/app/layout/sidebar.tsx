import {useQueryClient} from "@tanstack/react-query";
import {Link, useLocation} from "@tanstack/react-router";
import type {ReactNode} from "react";
import Button from "@/components/ui/button";
import type {ButtonProps} from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {IconName} from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Kbd from "@/components/ui/kbd";
import type {MouseEvent} from "react";
import UpdateButton from "@/features/updates/components/update-button";
import {listFolderSuggestionsQueryOptions} from "@/features/projects/api/command-palette/list-folder-suggestions";
import SortableProjectList from "@/features/projects/components/sidebar/sortable-project-list";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";
import {COMMAND_PALETTE_HOTKEY, useCommandPaletteStore} from "@/features/command-palette/stores/command-palette-store";
import type {CommandPalettePage} from "@/features/command-palette/types/command-palette";
import {useSidebarStore} from "@/stores/sidebar-store";

interface SidebarAction {
  readonly icon: IconName;
  readonly id: string;
  readonly label: string;
  /** The palette page the action opens; absent opens the palette's root list. */
  readonly page?: CommandPalettePage;
  readonly trailing?: ReactNode;
}

const SIDEBAR_ACTIONS: readonly SidebarAction[] = [
  {id: "new-project", icon: "folder", label: "New project", page: "open-project"},
  {id: "search", icon: "search", label: "Search", trailing: <Kbd className="opacity-0 transition-opacity group-hover:opacity-100" hotkeys={[COMMAND_PALETTE_HOTKEY]} />},
];

interface SidebarActionButtonProps extends Omit<ButtonProps, "children" | "onClick"> {
  readonly action: SidebarAction;
}

function SidebarActionButton(props: SidebarActionButtonProps) {
  const {action, className, ...buttonProps} = props;
  const openPalette = useCommandPaletteStore((state) => state.openPalette);
  const queryClient = useQueryClient();

  const handleClick = (): void => {
    openPalette(action.page);
  };

  // Hovering New project starts loading the home folder, so the page usually opens with its folders already there.
  const handlePointerEnter = (): void => {
    if (action.page === "open-project") void queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(""));
  };

  return (
    <Button className={cn("group gap-2", className)} onClick={handleClick} onPointerEnter={handlePointerEnter} size="sm" variant="primary" {...buttonProps}>
      <Icon className="text-ink-muted" name={action.icon} size="sm" />
      <span className="flex-1">{action.label}</span>
      {action.trailing}
    </Button>
  );
}

export default function Sidebar() {
  const collapseAllProjects = useSidebarStore((state) => state.collapseAllProjects);
  const expandedProjects = useSidebarStore((state) => state.expandedProjects);
  const isPinnedCollapsed = useSidebarStore((state) => state.isPinnedCollapsed);
  const isProjectsCollapsed = useSidebarStore((state) => state.isProjectsCollapsed);
  const togglePinnedCollapsed = useSidebarStore((state) => state.togglePinnedCollapsed);
  const toggleProject = useSidebarStore((state) => state.toggleProject);
  const toggleProjectsCollapsed = useSidebarStore((state) => state.toggleProjectsCollapsed);
  const location = useLocation();

  const projects = useProjectsStore((state) => state.projects);
  const pinnedProjects = projects.filter((project) => project.pinned);
  const regularProjects = projects.filter((project) => !project.pinned);

  const activeSessionId = location.pathname.startsWith("/session/") && location.pathname !== "/session/new" ? location.pathname.slice("/session/".length) : "";

  const openPalette = useCommandPaletteStore((state) => state.openPalette);

  const handleProjectsActionClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  const handleOpenProjectPage = (): void => {
    openPalette("open-project");
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col">
      <div className="space-y-0.5 px-3 pb-4 pt-1">
        {SIDEBAR_ACTIONS.map((action) => (
          <SidebarActionButton action={action} key={action.id} />
        ))}
      </div>

      <div className="scroll-fade-y min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {pinnedProjects.length > 0 && (
          <div>
            <Button className="group/pinned mb-2 flex h-6 w-full items-center justify-between px-2 text-ink-muted" onClick={togglePinnedCollapsed} variant="bare">
              <div className="flex items-center gap-1.5 text-left text-sm">
                <span>Pinned</span>
                <Icon
                  className={cn("opacity-0 group-hover/pinned:opacity-100 transition-transform duration-160 ease-out", isPinnedCollapsed && "-rotate-90")}
                  name="chevron-down"
                  size="xs"
                />
              </div>
            </Button>

            <div
              className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-160 ease-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
              data-expanded={!isPinnedCollapsed}
            >
              <SortableProjectList
                activeSessionId={activeSessionId}
                className="overflow-hidden mb-3"
                expandedProjectIds={expandedProjects}
                onToggleProject={toggleProject}
                projects={pinnedProjects}
              />
            </div>
          </div>
        )}

        <Button as="div" className="group/projects mb-2 flex h-6 w-full items-center justify-between px-2 text-ink-muted" onClick={toggleProjectsCollapsed} variant="bare">
          <div className="flex items-center gap-1.5 text-left text-sm">
            <span>Projects</span>
            <Icon
              className={cn("opacity-0 group-hover/projects:opacity-100 transition-transform duration-160 ease-out", isProjectsCollapsed && "-rotate-90")}
              name="chevron-down"
              size="xs"
            />
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover/projects:opacity-100" onClick={handleProjectsActionClick}>
            <IconButton className="size-6" label="Collapse projects" onClick={collapseAllProjects}>
              <Icon name="maximize" size="xs" />
            </IconButton>
            {/* TODO: Re-enable project filtering/sorting when the sidebar supports it.
            <IconButton className="size-6" label="Filter projects">
              <Icon name="filter" size="xs" />
            </IconButton>
            */}
            <IconButton className="size-6" label="New project" onClick={handleOpenProjectPage}>
              <Icon name="folder-plus" size="xs" />
            </IconButton>
          </div>
        </Button>

        <div
          className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-160 ease-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
          data-expanded={!isProjectsCollapsed}
        >
          {regularProjects.length === 0 ? (
            <p className="overflow-hidden px-2 py-1 text-sm text-ink-faint">Add a project to get started.</p>
          ) : (
            <SortableProjectList
              activeSessionId={activeSessionId}
              className="overflow-hidden"
              expandedProjectIds={expandedProjects}
              onToggleProject={toggleProject}
              projects={regularProjects}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-2.5">
        <Link
          className="flex flex-1 items-center gap-2 rounded-xl corner-superellipse/1.3 px-2 py-1.5 text-left text-sm text-ink hover:bg-overlay-hover hover:text-ink-strong"
          to="/settings"
        >
          <Icon name="settings" size="sm" />
          <span>Settings</span>
          {window.desktopApi?.nightly && <span className="text-xs text-ink-faint">Nightly</span>}
        </Link>
        <UpdateButton className="ml-auto shrink-0" />
      </div>
    </aside>
  );
}
