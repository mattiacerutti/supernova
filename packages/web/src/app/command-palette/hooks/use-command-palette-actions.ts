import {useNavigate, useParams} from "@tanstack/react-router";
import type {CommandPaletteAction} from "@/features/command-palette/types/command-palette";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import type {Project} from "@/features/projects/types/project";
import {useSession} from "@/features/sessions/api/conversation/get-session";

const GENERAL_SECTION = "Actions";

/** The pages the actions open; the palette renders each by name. */
export type CommandPalettePageId = "new-session" | "open-project";

/** The project of the open session, if a session is open. A new-session draft does not count: it is already new. */
function useOpenSessionProject(projects: readonly Project[]): Project | undefined {
  const sessionId = useParams({select: (params) => params.sessionId, strict: false});
  // Reads the open session from the cache only; its page already loaded it.
  const {data: session} = useSession(sessionId ?? "", {enabled: false});

  return sessionId === undefined ? undefined : projects.find((project) => project.path === session?.projectPath);
}

/**
 * The actions the palette's root list offers, in display order. Add an action here; one that needs its own list or
 * input opens a page by `CommandPalettePageId` instead of running.
 */
export function useCommandPaletteActions(): readonly CommandPaletteAction[] {
  const navigate = useNavigate();
  const projects = useProjectsStore((state) => state.projects);
  const openSessionProject = useOpenSessionProject(projects);
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
