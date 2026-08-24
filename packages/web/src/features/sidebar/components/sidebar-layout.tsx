import {useState} from "react";
import type {CSSProperties, PointerEvent, ReactNode} from "react";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import type {AppEnvironment} from "@/lib/app-environment";
import {isDesktopEnvironment} from "@/lib/app-environment";
import {cn} from "@/lib/cn";

interface SidebarLayoutProps {
  appEnvironment: AppEnvironment;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  onSidebarWidthChange?: (width: number) => void;
  sidebar: ReactNode;
  sidebarVisible?: boolean;
  sidebarWidth: number;
  titlebarActions?: ReactNode;
}

export default function SidebarLayout(props: SidebarLayoutProps) {
  const {appEnvironment, children, className, contentClassName, onSidebarWidthChange, sidebar, sidebarVisible = true, sidebarWidth, titlebarActions} = props;
  const translucentSidebar = useAppearanceStore((state) => state.translucentSidebar);
  const [resizing, setResizing] = useState(false);
  const desktopEnvironment = isDesktopEnvironment(appEnvironment);
  const macEnvironment = appEnvironment === "mac";
  const resizable = onSidebarWidthChange != null;

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!onSidebarWidthChange) return;

    event.preventDefault();
    setResizing(true);
    const updateSidebarWidth = onSidebarWidthChange;
    let nextSidebarWidth = sidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: globalThis.PointerEvent): void => {
      nextSidebarWidth = moveEvent.clientX;
      updateSidebarWidth(nextSidebarWidth);
    };

    const handlePointerUp = (): void => {
      updateSidebarWidth(nextSidebarWidth);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, {once: true});
  };

  const sidebarStyle = {"--sidebar-width": `${sidebarWidth}px`} as CSSProperties;

  return (
    <main className={cn("h-svh overflow-hidden text-ink", desktopEnvironment && "bg-transparent", className)}>
      <section
        className={cn(
          "relative flex h-full min-h-0 overflow-hidden bg-surface-sidebar",
          (macEnvironment || appEnvironment === "windows") && translucentSidebar && "bg-surface-sidebar-translucent backdrop-blur-sm backdrop-saturate-[1.35]"
        )}
      >
        {(titlebarActions != null || macEnvironment || appEnvironment === "windows") && (
          <div className={cn("absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-1 pr-3 [-webkit-app-region:drag]", macEnvironment ? "pl-23" : "pl-3")}>
            {titlebarActions}
          </div>
        )}

        <div
          className={cn(
            "relative shrink-0 overflow-hidden",
            !resizing && "transition-[width] duration-250 ease-in-out",
            sidebarVisible ? (resizable ? "w-full md:w-(--sidebar-width)" : "w-(--sidebar-width)") : "w-0"
          )}
          style={sidebarStyle}
        >
          <div
            className={cn(
              "h-full transition-opacity duration-200 ease-out",
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
            "flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-xl bg-surface",
            !sidebarVisible && "animate-[app-panel-flush-left_200ms_step-end_forwards]",
            contentClassName
          )}
        >
          {children}
        </section>
      </section>
    </main>
  );
}
