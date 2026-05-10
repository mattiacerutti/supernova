import {createRootRouteWithContext, createRoute, createRouter} from "@tanstack/react-router";
import type {AppEnvironment} from "@/app/app-environment";
import {HomeRoute, NewSessionRoute, RootRoute, SessionRoute, SettingsRoute, SettingsSectionRoute} from "@/app/routes";

interface IRouterContext {
  appEnvironment: AppEnvironment;
}

const rootRoute = createRootRouteWithContext<IRouterContext>()({
  component: RootRoute,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsRoute,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "session/$sessionId",
  component: SessionRoute,
});

const newSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "session/new",
  component: NewSessionRoute,
});

const settingsSectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings/$sectionId",
  component: SettingsSectionRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, newSessionRoute, sessionRoute, settingsRoute, settingsSectionRoute]);

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
