import {formatForDisplay, useHotkey} from "@tanstack/react-hotkeys";
import {useCanGoBack, useParams, useRouter, useRouterState} from "@tanstack/react-router";
import type {ReactNode} from "react";
import AppCommandPalette from "@/app/command-palette/command-palette";
import Sidebar from "@/app/layout/sidebar";
import {useSidebarVisibility} from "@/app/layout/use-sidebar-visibility";
import SidebarLayout, {SidebarLayoutContent, SidebarLayoutSidebar, SidebarLayoutTitlebar} from "@/components/layouts/sidebar-layout";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {isDesktopEnvironment} from "@/config/app-environment";
import {EMPTY_LAYOUT, MIN_WORKSPACE_PANEL_WIDTH, useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import {maxPanelWidth} from "@/components/layouts/panel-layout";
import {MIN_SIDEBAR_WIDTH, SIDEBAR_HOTKEY, useSidebarStore} from "@/stores/sidebar-store";

function HistoryNavigation() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  useRouterState({select: (state) => state.location.href});

  // TanStack Router does not expose canGoForward; good enough for desktop chrome.
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

export default function AppLayout(props: AppLayoutProps) {
  const {children} = props;
  const {animateSidebar, compactLayout, sidebarVisible, toggleSidebar} = useSidebarVisibility();
  const sidebarWidth = useSidebarStore((state) => state.sidebarWidth);
  const setSidebarWidth = useSidebarStore((state) => state.setSidebarWidth);
  const sessionId = useParams({select: (params) => params.sessionId, strict: false});
  const workspaceOpen = useWorkspacePanelStore((state) => (sessionId === undefined ? false : (state.layouts[sessionId] ?? EMPTY_LAYOUT).open));
  const reservedContentWidth = workspaceOpen ? MIN_WORKSPACE_PANEL_WIDTH : 0;

  useHotkey(SIDEBAR_HOTKEY, toggleSidebar);

  const handleSidebarWidthChange = (width: number): void => {
    setSidebarWidth(width, maxPanelWidth(window.innerWidth, MIN_SIDEBAR_WIDTH, reservedContentWidth));
  };

  return (
    <SidebarLayout minSidebarWidth={MIN_SIDEBAR_WIDTH} reservedContentWidth={reservedContentWidth} sidebarWidth={sidebarWidth}>
      <SidebarLayoutTitlebar sidebarVisible={sidebarVisible}>
        <IconButton className="size-7" label="Toggle sidebar" onClick={toggleSidebar} title={`Toggle sidebar (${formatForDisplay(SIDEBAR_HOTKEY)})`}>
          <Icon name="panel-left" size="sm" />
        </IconButton>
        {isDesktopEnvironment && <HistoryNavigation />}
      </SidebarLayoutTitlebar>
      <SidebarLayoutSidebar animate={animateSidebar} onWidthChange={handleSidebarWidthChange} visible={sidebarVisible} width={compactLayout ? undefined : sidebarWidth}>
        <Sidebar />
      </SidebarLayoutSidebar>
      <SidebarLayoutContent sidebarVisible={sidebarVisible}>{children}</SidebarLayoutContent>
      <AppCommandPalette />
    </SidebarLayout>
  );
}
