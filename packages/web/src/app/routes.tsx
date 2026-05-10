import {Outlet, useParams, useRouteContext, useSearch} from "@tanstack/react-router";
import HomePage from "@/components/home-page";
import SettingsPage from "@/features/settings/pages/settings-page";

export function RootRoute() {
  return <Outlet />;
}

export function HomeRoute() {
  const {integratedTitleBar} = useRouteContext({from: "__root__"});

  return <HomePage integratedTitleBar={integratedTitleBar} />;
}

export function SessionRoute() {
  const {integratedTitleBar} = useRouteContext({from: "__root__"});
  const {sessionId} = useParams({from: "/session/$sessionId"});

  return <HomePage sessionId={sessionId} integratedTitleBar={integratedTitleBar} />;
}

export function NewSessionRoute() {
  const {integratedTitleBar} = useRouteContext({from: "__root__"});
  const search = useSearch({from: "/session/new"}) as {projectId?: string};

  return <HomePage newSessionProjectId={search.projectId} integratedTitleBar={integratedTitleBar} />;
}

export function SettingsRoute() {
  const {integratedTitleBar} = useRouteContext({from: "__root__"});

  return <SettingsPage integratedTitleBar={integratedTitleBar} />;
}

export function SettingsSectionRoute() {
  const {integratedTitleBar} = useRouteContext({from: "__root__"});
  const {sectionId} = useParams({from: "/settings/$sectionId"});

  return <SettingsPage integratedTitleBar={integratedTitleBar} sectionId={sectionId} />;
}
