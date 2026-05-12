import {useState} from "react";
import type {CSSProperties, PointerEvent, ReactNode} from "react";
import type {AppEnvironment} from "@/app/app-environment";
import {isDesktopEnvironment, isMacEnvironment} from "@/app/app-environment";
import {useSidebarSectionsStore} from "@/features/sidebar/stores/sidebar-store";
import {cn} from "@/lib/cn";

interface ResizableSidebarLayoutProps {
  appEnvironment: AppEnvironment;
  children: ReactNode;
  sidebar: ReactNode;
  sidebarVisible?: boolean;
  titlebarActions?: ReactNode;
}

export default function ResizableSidebarLayout(props: ResizableSidebarLayoutProps) {
  const {appEnvironment, children, sidebar, sidebarVisible = true, titlebarActions} = props;
  const sidebarWidth = useSidebarSectionsStore((state) => state.sidebarWidth);
  const setSidebarWidth = useSidebarSectionsStore((state) => state.setSidebarWidth);
  const [resizeHandleActive, setResizeHandleActive] = useState(false);
  const [resizing, setResizing] = useState(false);
  const desktopEnvironment = isDesktopEnvironment(appEnvironment);
  const macEnvironment = isMacEnvironment(appEnvironment);

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setResizing(true);
    let nextSidebarWidth = sidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: globalThis.PointerEvent): void => {
      nextSidebarWidth = moveEvent.clientX;
      setSidebarWidth(nextSidebarWidth);
    };

    const handlePointerUp = (): void => {
      setSidebarWidth(nextSidebarWidth);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setResizing(false);
      setResizeHandleActive(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, {once: true});
  };

  const sidebarStyle = {"--sidebar-width": `${sidebarWidth}px`} as CSSProperties;

  return (
    <main className={cn("h-svh overflow-hidden text-neutral-200", desktopEnvironment && "desktop-window")}>
      <section className={cn("relative flex h-full min-h-0 overflow-hidden", desktopEnvironment ? "desktop-window-frame bg-[#282829]/80" : "bg-[#282829]")}>
        <div className={cn("desktop-titlebar absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-1 pr-3", macEnvironment ? "pl-23" : "pl-3")}>{titlebarActions}</div>

        <div
          className={cn("relative shrink-0 overflow-hidden", !resizing && "transition-[width] duration-250 ease-in-out", sidebarVisible ? "w-full md:w-(--sidebar-width)" : "w-0")}
          style={sidebarStyle}
        >
          <div className={cn("h-full w-screen transition-opacity duration-200 ease-out md:w-(--sidebar-width)", sidebarVisible ? "opacity-100" : "opacity-0")}>{sidebar}</div>
          {sidebarVisible && (
            <div
              className="absolute bottom-0 right-0 top-0 hidden w-1 cursor-col-resize md:block"
              onPointerDown={handleResizePointerDown}
              onPointerEnter={() => setResizeHandleActive(true)}
              onPointerLeave={() => {
                if (!resizing) setResizeHandleActive(false);
              }}
            />
          )}
        </div>
        <section
          className={cn(
            "app-panel flex h-full min-h-0 min-w-0 flex-1 flex-col border-l-[0.1px] rounded-xl bg-[#181818] px-4 pb-3 pt-1",
            resizeHandleActive || resizing ? "border-white/30" : "border-white/22"
          )}
          data-sidebar-visible={sidebarVisible}
        >
          {children}
        </section>
      </section>
    </main>
  );
}
