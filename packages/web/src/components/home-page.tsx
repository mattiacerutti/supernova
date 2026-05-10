import {useState} from "react";
import {useRouter, useRouterState, useCanGoBack} from "@tanstack/react-router";
import type {AppEnvironment} from "@/app/app-environment";
import {isDesktopEnvironment} from "@/app/app-environment";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ResizableSidebarLayout from "@/features/sidebar/components/resizable-sidebar-layout";
import Sidebar from "@/features/sidebar/components/sidebar";
import {useProjectList} from "@/features/projects/hooks/use-project-list";
import NewSessionPage from "@/features/sessions/pages/new-session-page";
import SessionPage from "@/features/sessions/pages/session-page";

interface IHomePageProps {
  appEnvironment: AppEnvironment;
  newSessionProjectId?: string;
  sessionId?: string;
}

export default function HomePage(props: IHomePageProps) {
  const {appEnvironment, newSessionProjectId, sessionId} = props;
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const router = useRouter();

  useRouterState({
    select: (state) => state.location.href,
  });

  const canGoBack = useCanGoBack();

  // TanStack Router does not expose canGoForward. This is good enough for desktop chrome,
  // where navigation stays inside the Electron shell and we do not want extra state.
  const currentIndex = router.history.location.state.__TSR_index ?? 0;
  const canGoForward = currentIndex < router.history.length - 1;
  const navigationVisible = isDesktopEnvironment(appEnvironment);

  const projects = useProjectList();
  const newSessionProject = newSessionProjectId ? projects.find((project) => project.id === newSessionProjectId) : undefined;

  const handleToggleSidebar = (): void => {
    setSidebarVisible((visible) => !visible);
  };

  const handleGoBack = (): void => {
    router.history.back();
  };

  const handleGoForward = (): void => {
    router.history.forward();
  };

  const titlebarActions = (
    <>
      <IconButton className="size-7" label="Toggle sidebar" onClick={handleToggleSidebar}>
        <Icon name="panel-left" size="sm" />
      </IconButton>
      {navigationVisible && (
        <>
          <IconButton className="size-7" disabled={!canGoBack} label="Go back" onClick={handleGoBack}>
            <Icon name="arrow-left" size="sm" />
          </IconButton>
          <IconButton className="size-7" disabled={!canGoForward} label="Go forward" onClick={handleGoForward}>
            <Icon name="arrow-right" size="sm" />
          </IconButton>
        </>
      )}
    </>
  );

  return (
    <ResizableSidebarLayout appEnvironment={appEnvironment} sidebar={<Sidebar />} sidebarVisible={sidebarVisible} titlebarActions={titlebarActions}>
      {newSessionProject && <NewSessionPage projectName={newSessionProject.name} projectPath={newSessionProject.path} />}
      {!newSessionProject && sessionId && <SessionPage appEnvironment={appEnvironment} key={sessionId} sessionId={sessionId} />}
      {!newSessionProject && !sessionId && <EmptySessionState />}
    </ResizableSidebarLayout>
  );
}

function EmptySessionState() {
  return (
    <div className="grid flex-1 place-items-center px-6 py-10">
      <p className="text-sm text-neutral-600">Select a session or start a new one.</p>
    </div>
  );
}
