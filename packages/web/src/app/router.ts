import {createRootRoute, createRoute, createRouter, redirect} from "@tanstack/react-router";
import {HomeLayoutRoute, HomeRoute, RootRoute, SessionRoute, SettingsSectionRoute} from "@/app/routes";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {useComposerDraftsStore} from "@/features/sessions/stores/composer/composer-drafts-store";
import {defaultSettingsSectionId, settingsSections} from "@/features/settings/pages/settings-sections";

interface NewSessionSearch {
  readonly projectId?: string;
  /** The id the session will be created under. Added by `beforeLoad`, so the draft's identity is in the URL. */
  readonly draft?: string;
}

const rootRoute = createRootRoute({
  component: RootRoute,
});

const homeLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "home-layout",
  component: HomeLayoutRoute,
});

const indexRoute = createRoute({
  getParentRoute: () => homeLayoutRoute,
  path: "/",
  component: HomeRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  beforeLoad: () => {
    throw redirect({params: {sectionId: defaultSettingsSectionId}, to: "/settings/$sectionId"});
  },
});

const sessionRoute = createRoute({
  getParentRoute: () => homeLayoutRoute,
  path: "session/$sessionId",
  component: SessionRoute,
});

const newSessionRoute = createRoute({
  getParentRoute: () => homeLayoutRoute,
  path: "session/new",
  validateSearch: (search: Record<string, unknown>): NewSessionSearch => ({
    ...(typeof search.projectId === "string" && {projectId: search.projectId}),
    ...(typeof search.draft === "string" && {draft: search.draft}),
  }),
  beforeLoad: ({search}) => {
    if (search.draft || !search.projectId) return;
    const project = useProjectsStore.getState().projects.find((candidate) => candidate.id === search.projectId);
    if (!project) return;
    throw redirect({replace: true, search: {draft: useComposerDraftsStore.getState().ensureNewSessionId(project.path), projectId: search.projectId}, to: "/session/new"});
  },
  component: SessionRoute,
});

const settingsSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings/$sectionId",
  beforeLoad: ({params}) => {
    if (!settingsSections.some((section) => section.id === params.sectionId)) {
      throw redirect({params: {sectionId: defaultSettingsSectionId}, to: "/settings/$sectionId"});
    }
  },
  component: SettingsSectionRoute,
});

const routeTree = rootRoute.addChildren([homeLayoutRoute.addChildren([indexRoute, newSessionRoute, sessionRoute]), settingsRoute, settingsSectionRoute]);

export const router = createRouter({routeTree});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
