import {Outlet, useParams, useRouteContext} from "@tanstack/react-router";
import HomePage from "@/components/home-page";
import SettingsPage from "@/features/settings/pages/settings-page";

export function RootRoute() {
  return <Outlet />;
}

export function HomeRoute() {
  const {integratedTitleBar} = useRouteContext({from: "__root__"});

  return <HomePage integratedTitleBar={integratedTitleBar} />;
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
