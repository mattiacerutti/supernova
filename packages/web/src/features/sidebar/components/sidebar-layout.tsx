import type {CSSProperties, ReactNode} from "react";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import {useDragResize} from "@/hooks/use-drag-resize";
import {MIN_SIDEBAR_WIDTH} from "@/features/sidebar/stores/sidebar-store";
import {clampedPanelWidth} from "@/lib/panel-layout";
import type {AppEnvironment} from "@/lib/app-environment";
import {isDesktopEnvironment} from "@/lib/app-environment";
import {cn} from "@/lib/cn";

interface SidebarLayoutProps {
  appEnvironment: AppEnvironment;
  children: ReactNode;
  className?: string;
  onSidebarWidthChange?: (width: number) => void;
  /** Width other panels in the content area need. */
  reservedContentWidth?: number;
  sidebar: ReactNode;
  sidebarVisible?: boolean;
  sidebarWidth: number;
  titlebarActions?: ReactNode;
}

export default function SidebarLayout(props: SidebarLayoutProps) {
  const {appEnvironment, children, className, onSidebarWidthChange, reservedContentWidth = 0, sidebar, sidebarVisible = true, sidebarWidth, titlebarActions} = props;
  const translucentSidebar = useAppearanceStore((state) => state.translucentSidebar);
  const handleResizePointerDown = useDragResize((clientX) => onSidebarWidthChange?.(clientX));
  const desktopEnvironment = isDesktopEnvironment(appEnvironment);
  const macEnvironment = appEnvironment === "mac";
  const resizable = onSidebarWidthChange != null;

  const sidebarStyle = {"--sidebar-width": clampedPanelWidth(sidebarWidth, MIN_SIDEBAR_WIDTH, reservedContentWidth)} as CSSProperties;

  return (
    <main className={cn("h-svh overflow-hidden text-ink", desktopEnvironment && "bg-transparent", className)}>
      <section
        className={cn(
          "@container relative flex h-full min-h-0 overflow-hidden bg-surface-sidebar",
          (macEnvironment || appEnvironment === "windows") && translucentSidebar && "bg-surface-sidebar-translucent"
        )}
      >
        {(titlebarActions != null || macEnvironment || appEnvironment === "windows") && (
          <div className="absolute inset-x-0 top-0 z-10 flex h-12 items-center [-webkit-app-region:drag]" style={sidebarStyle}>
            <div
              className={cn(
                "flex h-full items-center gap-1 pr-3",
                macEnvironment ? "pl-23" : "pl-3",
                sidebarVisible && "w-(--sidebar-width)",
                "transition-[width] duration-250 ease-in-out [[data-resizing]_&]:transition-none [[data-resizing]_&]:duration-0"
              )}
            >
              {titlebarActions}
            </div>
          </div>
        )}

        <div
          className={cn(
            "relative shrink-0 overflow-hidden",
            "transition-[width] duration-250 ease-in-out [[data-resizing]_&]:transition-none [[data-resizing]_&]:duration-0",
            sidebarVisible ? (resizable ? "w-full md:w-(--sidebar-width)" : "w-(--sidebar-width)") : "w-0"
          )}
          style={sidebarStyle}
        >
          <div
            className={cn(
              "h-full pt-12 transition-opacity duration-200 ease-out",
              resizable ? "w-screen md:w-(--sidebar-width)" : "w-(--sidebar-width)",
              sidebarVisible ? "opacity-100" : "opacity-0"
            )}
          >
            {sidebar}
          </div>
          {resizable && sidebarVisible && <div className="absolute bottom-0 right-0 top-0 hidden w-1 cursor-col-resize md:block" onPointerDown={handleResizePointerDown} />}
        </div>

        <section
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-1 flex-col border-l-[0.1px] bg-surface",
            sidebarVisible ? "rounded-xl border-border-strong" : "rounded-r-xl border-l-transparent transition-[border-color,border-radius] delay-200 duration-0"
          )}
        >
          {children}
        </section>
      </section>
    </main>
  );
}
