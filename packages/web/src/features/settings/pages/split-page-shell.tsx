import type {ReactNode} from "react";
import type {AppEnvironment} from "@/app/app-environment";
import {isDesktopEnvironment, isMacEnvironment} from "@/app/app-environment";
import {cn} from "@/lib/cn";

interface SplitPageShellProps {
  appEnvironment: AppEnvironment;
  children: ReactNode;
  sidebar: ReactNode;
  titlebarActions?: ReactNode;
}

export default function SplitPageShell(props: SplitPageShellProps) {
  const {appEnvironment, children, sidebar, titlebarActions} = props;
  const desktopEnvironment = isDesktopEnvironment(appEnvironment);
  const macEnvironment = isMacEnvironment(appEnvironment);

  return (
    <main className={cn("h-svh overflow-hidden text-neutral-200", desktopEnvironment && "desktop-window")}>
      <section className={cn("relative flex h-full min-h-0 overflow-hidden", desktopEnvironment ? "desktop-window-frame bg-[#282829]/80" : "bg-[#282829]")}>
        <div className={cn("desktop-titlebar absolute inset-x-0 top-0 z-10 flex h-12 items-center gap-1 pr-3", macEnvironment ? "pl-23" : "pl-3")}>{titlebarActions}</div>

        <div className="w-72 shrink-0 overflow-hidden">{sidebar}</div>
        <section className="app-panel flex h-full min-h-0 min-w-0 flex-1 flex-col border-l-[0.1px] bg-[#181818] pt-14 border-white/22 rounded-xl" data-sidebar-visible={true}>
          {children}
        </section>
      </section>
    </main>
  );
}
