import {Outlet, useParams, useSearch} from "@tanstack/react-router";
import AppLayout from "@/app/layout/app-layout";
import {ToastViewport} from "@/components/ui/toast";
import ExtensionNoticesDialog from "@/features/sessions/components/conversation/extension-notices-dialog";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import SettingsPage from "@/features/settings/pages/settings-page";
import SessionPage from "@/features/sessions/pages/session-page";
import type {SessionPageTarget} from "@/features/sessions/pages/session-page";

function EmptySessionState() {
  return (
    <div className="grid flex-1 place-items-center px-6 py-10">
      <p className="text-sm text-ink-faint">Select a session or start a new one.</p>
    </div>
  );
}

export function RootRoute() {
  // Toasts scoped to a session show only on that session's page, so the viewport reads the open session from the route.
  const sessionId = useParams({select: (params) => params.sessionId, strict: false});
  return (
    <>
      <Outlet />
      <ToastViewport openSessionId={sessionId} />
    </>
  );
}

export function HomeLayoutRoute() {
  return (
    <AppLayout>
      <Outlet />
      {/* Opened from a session's extension notice toast, on whichever session page it shows. */}
      <ExtensionNoticesDialog />
    </AppLayout>
  );
}

export function HomeRoute() {
  return <EmptySessionState />;
}

/**
 * Serves `/session/new` and `/session/$sessionId` with one page keyed by session id. A draft already carries the id
 * its session will get, so sending the first message changes the URL without remounting the page.
 */
export function SessionRoute() {
  const {sessionId} = useParams({strict: false});
  const search = useSearch({strict: false}) as {draft?: string; projectId?: string};
  const projects = useProjectsStore((state) => state.projects);

  let target: SessionPageTarget | undefined;
  if (sessionId !== undefined) target = {kind: "session", sessionId};
  else {
    const project = search.projectId ? projects.find((candidate) => candidate.id === search.projectId) : undefined;
    if (project && search.draft) target = {kind: "new", projectName: project.name, projectPath: project.path, sessionId: search.draft};
  }

  if (!target) return <EmptySessionState />;

  return <SessionPage key={target.sessionId} target={target} />;
}

export function SettingsSectionRoute() {
  const {sectionId} = useParams({from: "/settings/$sectionId"});

  return <SettingsPage sectionId={sectionId} />;
}
