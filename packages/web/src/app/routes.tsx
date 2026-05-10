import {Outlet, useParams, useRouteContext, useSearch} from "@tanstack/react-router";
import HomePage from "@/components/home-page";
import SettingsPage from "@/features/settings/pages/settings-page";

export function RootRoute() {
  return <Outlet />;
}

export function HomeRoute() {
  const {appEnvironment} = useRouteContext({from: "__root__"});

  return <HomePage appEnvironment={appEnvironment} />;
}

export function SessionRoute() {
  const {appEnvironment} = useRouteContext({from: "__root__"});
  const {sessionId} = useParams({from: "/session/$sessionId"});

  return <HomePage appEnvironment={appEnvironment} sessionId={sessionId} />;
}

export function NewSessionRoute() {
  const {appEnvironment} = useRouteContext({from: "__root__"});
  const search = useSearch({from: "/session/new"}) as {projectId?: string};

  return <HomePage appEnvironment={appEnvironment} newSessionProjectId={search.projectId} />;
}

export function SettingsRoute() {
  const {appEnvironment} = useRouteContext({from: "__root__"});

  return <SettingsPage appEnvironment={appEnvironment} />;
}

export function SettingsSectionRoute() {
  const {appEnvironment} = useRouteContext({from: "__root__"});
  const {sectionId} = useParams({from: "/settings/$sectionId"});

  return <SettingsPage appEnvironment={appEnvironment} sectionId={sectionId} />;
}
