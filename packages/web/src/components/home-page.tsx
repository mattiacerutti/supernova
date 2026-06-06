import {useRouter, useRouterState, useCanGoBack} from "@tanstack/react-router";
import type {ReactNode} from "react";
import type {AppEnvironment} from "@/app/app-environment";
import {isDesktopEnvironment} from "@/app/app-environment";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ResizableSidebarLayout from "@/features/sidebar/components/resizable-sidebar-layout";
import Sidebar from "@/features/sidebar/components/sidebar";
import {useSidebarVisibility} from "@/features/sidebar/hooks/use-sidebar-visibility";

interface HomePageProps {
  appEnvironment: AppEnvironment;
  children: ReactNode;
}

export default function HomePage(props: HomePageProps) {
  const {appEnvironment, children} = props;
  const {sidebarVisible, toggleSidebar} = useSidebarVisibility();
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
    </>
  );

  return (
    <ResizableSidebarLayout appEnvironment={appEnvironment} sidebar={<Sidebar />} sidebarVisible={sidebarVisible} titlebarActions={titlebarActions}>
      {children}
    </ResizableSidebarLayout>
  );
}
