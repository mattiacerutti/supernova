import {useNavigate} from "@tanstack/react-router";
import {useCommandPaletteActions} from "@/app/command-palette/hooks/use-command-palette-actions";
import type {CommandPalettePageId} from "@/app/command-palette/hooks/use-command-palette-actions";
import {useCommandPaletteSessions} from "@/app/command-palette/hooks/use-command-palette-sessions";
import CommandPalette from "@/features/command-palette/components/command-palette";
import type {CommandPalettePageRenderer, CommandPaletteSession} from "@/features/command-palette/types/command-palette";
import {usePrefetchFolderSuggestions} from "@/features/projects/api/command-palette/list-folder-suggestions";
import NewSessionProjectPage from "@/features/projects/components/command-palette/new-session-project-page";
import OpenProjectPage from "@/features/projects/components/command-palette/open-project-page";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {useSidebarStore} from "@/stores/sidebar-store";

/** The app's command palette: the `projects` and `sessions` features' actions and pages in one `CommandPalette`. */
export default function AppCommandPalette() {
  const navigate = useNavigate();
  const actions = useCommandPaletteActions();
  const addProject = useProjectsStore((state) => state.addProject);
  const expandProject = useSidebarStore((state) => state.expandProject);
  // Open project lists the home folder first; loading it as the app starts means the page opens with its folders there.
  const prefetchFolderSuggestions = usePrefetchFolderSuggestions();
  useMountEffect(() => void prefetchFolderSuggestions(""));

  const handleOpenSession = (session: CommandPaletteSession): void => {
    void navigate({params: {sessionId: session.id}, to: "/session/$sessionId"});
  };

  const handleOpenProject = (projectPath: string): void => {
    const project = addProject(projectPath);
    if (project) expandProject(project.id);
  };

  const pages: Record<CommandPalettePageId, CommandPalettePageRenderer> = {
    "new-session": ({onBack, onClose}) => <NewSessionProjectPage onBack={onBack} onClose={onClose} />,
    "open-project": ({onBack, onClose}) => <OpenProjectPage onBack={onBack} onClose={onClose} onOpenProject={handleOpenProject} />,
  };

  return <CommandPalette actions={actions} onOpenSession={handleOpenSession} pages={pages} useSessionSearch={useCommandPaletteSessions} />;
}
