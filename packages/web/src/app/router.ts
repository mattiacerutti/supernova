import {createRootRouteWithContext, createRoute, createRouter, redirect} from "@tanstack/react-router";
import type {AppEnvironment} from "@/lib/app-environment";
import {HomeLayoutRoute, HomeRoute, NewSessionRoute, RootRoute, SessionRoute, SettingsSectionRoute} from "@/app/routes";
import {defaultSettingsSectionId, settingsSections} from "@/features/settings/data/settings-sections";

interface RouterContext {
  appEnvironment: AppEnvironment;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
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
  component: NewSessionRoute,
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

export const router = createRouter({
  context: {
    appEnvironment: "web",
  },
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
