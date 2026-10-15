import type {CSSProperties, ReactNode} from "react";
import {isDesktopEnvironment, isMacEnvironment, isWindowsEnvironment} from "@/config/app-environment";
import {useDragResize} from "@/hooks/use-drag-resize";
import {cn} from "@/lib/cn";
import {clampedPanelWidth, observePanelWidth, PANEL_TRANSITION} from "@/components/layouts/panel-layout";
import {useSettingsStore} from "@/stores/settings-store";

interface SidebarLayoutProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly minSidebarWidth: number;
  readonly reservedContentWidth?: number;
  readonly sidebarWidth: number;
}

export default function SidebarLayout(props: SidebarLayoutProps) {
  const {children, className, minSidebarWidth, reservedContentWidth = 0, sidebarWidth} = props;
  const translucentSidebar = useSettingsStore((state) => state.translucentSidebar);
  const style = {"--sidebar-width": clampedPanelWidth(sidebarWidth, minSidebarWidth, reservedContentWidth)} as CSSProperties;

  return (
    <main className={cn("h-svh overflow-hidden text-ink", isDesktopEnvironment && "bg-transparent", className)}>
      <section
        className={cn(
          "@container relative flex h-full min-h-0 overflow-hidden bg-surface-sidebar",
          (isMacEnvironment || isWindowsEnvironment) && translucentSidebar && "bg-surface-sidebar-translucent"
        )}
        style={style}
      >
        {children}
      </section>
    </main>
  );
}

interface SidebarLayoutTitlebarProps {
  readonly children?: ReactNode;
  readonly sidebarVisible: boolean;
}

export function SidebarLayoutTitlebar(props: SidebarLayoutTitlebarProps) {
  const {children, sidebarVisible} = props;

  if (children == null && !isMacEnvironment && !isWindowsEnvironment) return null;

  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-12 items-center [-webkit-app-region:drag]">
      <div className={cn("flex h-full items-center gap-1 pr-3", isMacEnvironment ? "pl-23" : "pl-3", sidebarVisible && "w-(--sidebar-width)")}>{children}</div>
    </div>
  );
}

interface SidebarLayoutSidebarProps {
  readonly children: ReactNode;
  readonly animate?: boolean;
  readonly width?: number;
  readonly onWidthChange?: (width: number) => void;
  readonly visible?: boolean;
}

export function SidebarLayoutSidebar(props: SidebarLayoutSidebarProps) {
  const {animate = true, children, onWidthChange, visible = true, width} = props;
  const handleResizePointerDown = useDragResize((clientX) => onWidthChange?.(clientX));
  const resizable = onWidthChange != null;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden w-[calc(var(--panel-width)*var(--panel-open))]",
        resizable ? "[--panel-width:100vw] md:[--panel-width:var(--sidebar-width)]" : "[--panel-width:var(--sidebar-width)]",
        animate && PANEL_TRANSITION,
        visible ? "[--panel-open:1]" : "[--panel-open:0]"
      )}
      inert={!visible}
    >
      <div
        className={cn("h-full w-(--panel-width) pt-12", animate && "transition-opacity duration-200 ease-out motion-reduce:transition-none", visible ? "opacity-100" : "opacity-0")}
        ref={(element) => {
          if (element && visible && width !== undefined && onWidthChange) return observePanelWidth(element, width, onWidthChange);
        }}
      >
        {children}
      </div>
      {resizable && visible && <div className="absolute bottom-0 right-0 top-0 hidden w-1 cursor-col-resize md:block" onPointerDown={handleResizePointerDown} />}
    </div>
  );
}

interface SidebarLayoutContentProps {
  readonly children: ReactNode;
  readonly sidebarVisible?: boolean;
}

export function SidebarLayoutContent(props: SidebarLayoutContentProps) {
  const {children, sidebarVisible = true} = props;

  return (
    <section
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col border-l-[0.1px] bg-surface",
        sidebarVisible ? "rounded-xl border-border-strong" : "rounded-r-xl border-l-transparent transition-[border-color,border-radius] delay-200 duration-0"
      )}
    >
      {children}
    </section>
  );
}
