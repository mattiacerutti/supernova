import {useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ResizableSidebarLayout from "@/features/sidebar/components/resizable-sidebar-layout";
import Sidebar from "@/features/sidebar/components/sidebar";
import {useProjectList} from "@/features/projects/hooks/use-project-list";
import NewSessionPage from "@/features/sessions/pages/new-session-page";
import SessionPage from "@/features/sessions/pages/session-page";

interface IHomePageProps {
  integratedTitleBar: boolean;
  newSessionProjectId?: string;
  sessionId?: string;
}

export default function HomePage(props: IHomePageProps) {
  const {integratedTitleBar, newSessionProjectId, sessionId} = props;
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const projects = useProjectList();
  const newSessionProject = newSessionProjectId ? projects.find((project) => project.id === newSessionProjectId) : undefined;

  const handleToggleSidebar = (): void => {
    setSidebarVisible((visible) => !visible);
  };

  const titlebarActions = (
    <>
      <IconButton className="size-7" label="Toggle sidebar" onClick={handleToggleSidebar}>
        <Icon name="panel-left" size="sm" />
      </IconButton>
      <IconButton className="size-7" label="Go back">
        <Icon name="arrow-left" size="sm" />
      </IconButton>
      <IconButton className="size-7" label="Go forward">
        <Icon name="arrow-right" size="sm" />
      </IconButton>
    </>
  );

  return (
    <ResizableSidebarLayout integratedTitleBar={integratedTitleBar} sidebar={<Sidebar />} sidebarVisible={sidebarVisible} titlebarActions={titlebarActions}>
      {newSessionProject && <NewSessionPage projectName={newSessionProject.name} projectPath={newSessionProject.path} />}
      {!newSessionProject && sessionId && <SessionPage key={sessionId} sessionId={sessionId} />}
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
