import {useNavigate, useParams} from "@tanstack/react-router";
import type {CommandPaletteAction} from "@/features/command-palette/types/command-palette";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {Project} from "@/features/projects/types/project";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";

const GENERAL_SECTION = "Actions";

export type CommandPalettePageId = "new-session" | "open-project" | "open-session-in";

function useOpenSessionProject(projects: readonly Project[]): Project | undefined {
  const sessionId = useParams({select: (params) => params.sessionId, strict: false});
  // The runtime's directory names every open session's project; the session page already follows the open one.
  const projectPath = useSessionsStore((state) => (sessionId === undefined ? undefined : state.entries[sessionId]?.projectPath));

  return projectPath === undefined ? undefined : projects.find((project) => project.path === projectPath);
}

export function useOpenSessionWorkspacePath(): string | undefined {
  const sessionId = useParams({select: (params) => params.sessionId, strict: false});

  return useSessionsStore((state) => {
    const session = sessionId === undefined ? undefined : state.documents[sessionId];
    return session && (session.worktree?.path ?? session.projectPath);
  });
}

export function useCommandPaletteActions(): readonly CommandPaletteAction[] {
  const navigate = useNavigate();
  const projects = useProjectsStore((state) => state.projects);
  const openSessionProject = useOpenSessionProject(projects);
  const workspacePath = useOpenSessionWorkspacePath();
  const actions: CommandPaletteAction[] = [];

  // Inside a session, a new one starts in the same project; elsewhere there is no project to assume, so it is picked.
  if (openSessionProject) {
    actions.push({
      detail: openSessionProject.name,
      icon: "new-session",
      id: "new-session",
      kind: "run",
      run: () => void navigate({search: {projectId: openSessionProject.id}, to: "/session/new"}),
      section: GENERAL_SECTION,
      title: "New session",
    });
  }

  if (projects.length > 0) {
    actions.push({
      icon: "folders",
      id: "new-session-in",
      keywords: ["project"],
      kind: "page",
      page: "new-session" satisfies CommandPalettePageId,
      section: GENERAL_SECTION,
      title: "New session in…",
    });
  }

  // Desktop only: the path is on the server, which is this machine only when the desktop app runs its own API.
  if (window.desktopApi && workspacePath !== undefined) {
    actions.push({
      icon: "code",
      id: "open-session-in",
      keywords: ["editor", "vs code", "cursor", "zed", "finder", "explorer", "worktree"],
      kind: "page",
      page: "open-session-in" satisfies CommandPalettePageId,
      section: GENERAL_SECTION,
      title: "Open session in…",
    });
  }

  actions.push({
    icon: "folder-plus",
    id: "open-project",
    keywords: ["add", "folder", "new project"],
    kind: "page",
    page: "open-project" satisfies CommandPalettePageId,
    section: GENERAL_SECTION,
    title: "Open project",
  });

  return actions;
}
