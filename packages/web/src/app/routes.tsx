import {Outlet, useParams, useSearch} from "@tanstack/react-router";
import AppLayout from "@/app/layout/app-layout";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import SettingsPage from "@/features/settings/pages/settings-page";
import NewSessionPage from "@/features/sessions/pages/new-session-page";
import SessionPage from "@/features/sessions/pages/session-page";

function EmptySessionState() {
  return (
    <div className="grid flex-1 place-items-center px-6 py-10">
      <p className="text-sm text-ink-faint">Select a session or start a new one.</p>
    </div>
  );
}

export function RootRoute() {
  return <Outlet />;
}

export function HomeLayoutRoute() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export function HomeRoute() {
  return <EmptySessionState />;
}

export function SessionRoute() {
  const {sessionId} = useParams({from: "/home-layout/session/$sessionId"});

  return <SessionPage key={sessionId} sessionId={sessionId} />;
}

export function NewSessionRoute() {
  const search = useSearch({from: "/home-layout/session/new"}) as {projectId?: string};
  const projects = useProjectsStore((state) => state.projects);
  const project = search.projectId ? projects.find((candidate) => candidate.id === search.projectId) : undefined;

  if (!project) return <EmptySessionState />;

  return <NewSessionPage key={project.path} projectName={project.name} projectPath={project.path} />;
}

export function SettingsSectionRoute() {
  const {sectionId} = useParams({from: "/settings/$sectionId"});

  return <SettingsPage sectionId={sectionId} />;
}
