import {useParams, useRouter, useRouterState, useCanGoBack} from "@tanstack/react-router";
import type {ReactNode} from "react";
import type {AppEnvironment} from "@/lib/app-environment";
import {isDesktopEnvironment} from "@/lib/app-environment";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SidebarLayout from "@/features/sidebar/components/sidebar-layout";
import Sidebar from "@/features/sidebar/components/sidebar";
import UpdateButton from "@/features/updates/components/update-button";
import {useSidebarVisibility} from "@/features/sidebar/hooks/use-sidebar-visibility";
import {MIN_SIDEBAR_WIDTH, useSidebarSectionsStore} from "@/features/sidebar/stores/sidebar-store";
import {minWorkspacePanelWidth} from "@/features/workspace/lib/workspace-panel-width";
import {EMPTY_LAYOUT, useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import {maxPanelWidth} from "@/lib/panel-layout";

interface HomePageProps {
  appEnvironment: AppEnvironment;
  children: ReactNode;
}

export default function HomePage(props: HomePageProps) {
  const {appEnvironment, children} = props;
  const {sidebarVisible, toggleSidebar} = useSidebarVisibility();
  const sidebarWidth = useSidebarSectionsStore((state) => state.sidebarWidth);
  const setSidebarWidth = useSidebarSectionsStore((state) => state.setSidebarWidth);
  // The workspace panel belongs to the session route; outside it nothing is reserved.
  const sessionId = useParams({select: (params) => params.sessionId, strict: false});
  const workspaceOpen = useWorkspacePanelStore((state) => (sessionId === undefined ? false : (state.layouts[sessionId] ?? EMPTY_LAYOUT).open));
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

  const handleGoBack = (): void => {
    router.history.back();
  };

  const handleGoForward = (): void => {
    router.history.forward();
  };

  const reservedContentWidth = workspaceOpen ? minWorkspacePanelWidth(appEnvironment) : 0;
  const handleSidebarWidthChange = (width: number): void => {
    setSidebarWidth(width, maxPanelWidth(window.innerWidth, MIN_SIDEBAR_WIDTH, reservedContentWidth));
  };

  const titlebarActions = (
    <>
      <IconButton className="size-7" label="Toggle sidebar" onClick={toggleSidebar}>
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
      {sidebarVisible && <UpdateButton className="ml-auto" />}
    </>
  );

  return (
    <SidebarLayout
      appEnvironment={appEnvironment}
      onSidebarWidthChange={handleSidebarWidthChange}
      reservedContentWidth={reservedContentWidth}
      sidebar={<Sidebar />}
      sidebarVisible={sidebarVisible}
      sidebarWidth={sidebarWidth}
      titlebarActions={titlebarActions}
    >
      {children}
    </SidebarLayout>
  );
}
