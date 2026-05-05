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
    <main className={cn("min-h-svh text-neutral-100", integratedTitleBar ? "desktop-window" : "bg-neutral-950")}>
      <section className={cn("relative flex min-h-svh overflow-hidden", integratedTitleBar ? "desktop-window-frame bg-neutral-800/75" : "bg-neutral-700")}>
        <div className={cn("desktop-titlebar absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-1 pr-3", integratedTitleBar ? "pl-25" : "pl-3")}>{titlebarActions}</div>

        <div className={cn("shrink-0 overflow-hidden transition-[width] duration-200 ease-out", sidebarVisible ? "w-full md:w-72" : "w-0")}>{sidebar}</div>
        <section className="app-panel flex min-h-0 flex-1 flex-col bg-neutral-950/80 pt-14" data-sidebar-visible={sidebarVisible}>
          {children}
        </section>
      </section>
    </main>
  );
}
