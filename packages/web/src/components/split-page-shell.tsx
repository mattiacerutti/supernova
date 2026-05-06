import type {ReactNode} from "react";
import {cn} from "@/lib/cn";

interface ISplitPageShellProps {
  children: ReactNode;
  integratedTitleBar: boolean;
  sidebar: ReactNode;
  sidebarVisible?: boolean;
  titlebarActions?: ReactNode;
}

export default function SplitPageShell(props: ISplitPageShellProps) {
  const {children, integratedTitleBar, sidebar, sidebarVisible = true, titlebarActions} = props;

  return (
    <main className={cn("h-svh overflow-hidden text-neutral-100", integratedTitleBar && "desktop-window")}>
      <section className={cn("relative flex h-full min-h-0 overflow-hidden", integratedTitleBar ? "desktop-window-frame bg-[#282829]/80" : "bg-[#282829]")}>
        <div className={cn("desktop-titlebar absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-1 pr-3", integratedTitleBar ? "pl-25" : "pl-3")}>{titlebarActions}</div>

        <div className={cn("shrink-0 overflow-hidden transition-[width] duration-200 ease-out", sidebarVisible ? "w-full md:w-72" : "w-0")}>{sidebar}</div>
        <section className="app-panel flex h-full min-h-0 flex-1 flex-col border-l-[0.1px] bg-[#181818] pt-14 border-white/22 rounded-xl" data-sidebar-visible={sidebarVisible}>
          {children}
        </section>
      </section>
    </main>
  );
}
