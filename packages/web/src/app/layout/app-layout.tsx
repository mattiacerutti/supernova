import {useCanGoBack, useParams, useRouter, useRouterState} from "@tanstack/react-router";
import type {ReactNode} from "react";
import Sidebar from "@/app/layout/sidebar";
import {useSidebarVisibility} from "@/app/layout/use-sidebar-visibility";
import SidebarLayout, {SidebarLayoutContent, SidebarLayoutSidebar, SidebarLayoutTitlebar} from "@/components/layouts/sidebar-layout";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {isDesktopEnvironment} from "@/config/app-environment";
import {EMPTY_LAYOUT, MIN_WORKSPACE_PANEL_WIDTH, useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import {maxPanelWidth} from "@/components/layouts/panel-layout";
import {MIN_SIDEBAR_WIDTH, useSidebarStore} from "@/stores/sidebar-store";

/** Back/forward for the desktop shell, where navigation stays inside the window. */
function HistoryNavigation() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // Re-render on navigation so the forward check below stays current.
  useRouterState({select: (state) => state.location.href});

  // TanStack Router does not expose canGoForward. This is good enough for desktop chrome,
  // where navigation stays inside the Electron shell and we do not want extra state.
  const currentIndex = router.history.location.state.__TSR_index ?? 0;
  const canGoForward = currentIndex < router.history.length - 1;

  return (
    <>
      <IconButton className="size-7" disabled={!canGoBack} label="Go back" onClick={() => router.history.back()}>
        <Icon name="arrow-left" size="sm" />
      </IconButton>
      <IconButton className="size-7" disabled={!canGoForward} label="Go forward" onClick={() => router.history.forward()}>
        <Icon name="arrow-right" size="sm" />
      </IconButton>
    </>
  );
}

interface AppLayoutProps {
  readonly children: ReactNode;
}

/** The main app shell: project sidebar, titlebar controls, and the routed content. */
export default function AppLayout(props: AppLayoutProps) {
  const {children} = props;
  const {sidebarVisible, toggleSidebar} = useSidebarVisibility();
  const sidebarWidth = useSidebarStore((state) => state.sidebarWidth);
  const setSidebarWidth = useSidebarStore((state) => state.setSidebarWidth);
  // The workspace panel belongs to the session route; outside it nothing is reserved.
  const sessionId = useParams({select: (params) => params.sessionId, strict: false});
  const workspaceOpen = useWorkspacePanelStore((state) => (sessionId === undefined ? false : (state.layouts[sessionId] ?? EMPTY_LAYOUT).open));
  const reservedContentWidth = workspaceOpen ? MIN_WORKSPACE_PANEL_WIDTH : 0;

  const handleSidebarWidthChange = (width: number): void => {
    setSidebarWidth(width, maxPanelWidth(window.innerWidth, MIN_SIDEBAR_WIDTH, reservedContentWidth));
  };

  return (
    <SidebarLayout minSidebarWidth={MIN_SIDEBAR_WIDTH} reservedContentWidth={reservedContentWidth} sidebarWidth={sidebarWidth}>
      <SidebarLayoutTitlebar sidebarVisible={sidebarVisible}>
        <IconButton className="size-7" label="Toggle sidebar" onClick={toggleSidebar}>
          <Icon name="panel-left" size="sm" />
        </IconButton>
        {isDesktopEnvironment && <HistoryNavigation />}
      </SidebarLayoutTitlebar>
      <SidebarLayoutSidebar onWidthChange={handleSidebarWidthChange} visible={sidebarVisible}>
        <Sidebar />
      </SidebarLayoutSidebar>
      <SidebarLayoutContent sidebarVisible={sidebarVisible}>{children}</SidebarLayoutContent>
    </SidebarLayout>
  );
}
