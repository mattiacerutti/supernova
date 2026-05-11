import {Outlet, useParams, useRouteContext, useSearch} from "@tanstack/react-router";
import HomePage from "@/components/home-page";
import {useProjectList} from "@/features/projects/hooks/use-project-list";
import SettingsPage from "@/features/settings/pages/settings-page";
import NewSessionPage from "@/features/sessions/pages/new-session-page";
import SessionPage from "@/features/sessions/pages/session-page";

export function RootRoute() {
  return <Outlet />;
}

export function HomeLayoutRoute() {
  const {appEnvironment} = useRouteContext({from: "__root__"});

  return (
    <HomePage appEnvironment={appEnvironment}>
      <Outlet />
    </HomePage>
  );
}

export function HomeRoute() {
  return <EmptySessionState />;
}

export function SessionRoute() {
  const {appEnvironment} = useRouteContext({from: "__root__"});
  const {sessionId} = useParams({from: "/home-layout/session/$sessionId"});

  return <SessionPage appEnvironment={appEnvironment} key={sessionId} sessionId={sessionId} />;
}

export function NewSessionRoute() {
  const search = useSearch({from: "/home-layout/session/new"}) as {projectId?: string};
  const projects = useProjectList();
  const project = search.projectId ? projects.find((candidate) => candidate.id === search.projectId) : undefined;

  if (!project) return <EmptySessionState />;

  return <NewSessionPage projectName={project.name} projectPath={project.path} />;
}

function EmptySessionState() {
  return (
    <div className="grid flex-1 place-items-center px-6 py-10">
      <p className="text-sm text-neutral-600">Select a session or start a new one.</p>
    </div>
  );
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
