import {useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import {cn} from "@/lib/cn";
import ChatPanel from "@/features/chat/components/chat-panel";
import AppSidebar from "@/features/sidebar/components/app-sidebar";

interface IAppProps {
  integratedTitleBar?: boolean;
}

export default function App(props: IAppProps) {
  const {integratedTitleBar = false} = props;
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const handleToggleSidebar = (): void => {
    setSidebarVisible((visible) => !visible);
  };

  return (
    <main className={cn("min-h-svh text-zinc-100", integratedTitleBar ? "desktop-window" : "bg-zinc-950")}>
      <section className={cn("relative flex min-h-svh overflow-hidden", integratedTitleBar ? "desktop-window-frame bg-neutral-900/75" : "bg-zinc-900")}>
        <div className={cn("desktop-titlebar absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-1 pr-3", integratedTitleBar ? "pl-25" : "pl-3")}>
          <IconButton className="size-7" label="Toggle sidebar" onClick={handleToggleSidebar}>
            <Icon name="panel-left" size="sm" />
          </IconButton>
          <IconButton className="size-7" label="Go back">
            <Icon name="arrow-left" size="sm" />
          </IconButton>
          <IconButton className="size-7" label="Go forward">
            <Icon name="arrow-right" size="sm" />
          </IconButton>
        </div>

        <div className={cn("shrink-0 overflow-hidden transition-[width] duration-200 ease-out", sidebarVisible ? "w-full md:w-72" : "w-0")}>
          <AppSidebar />
        </div>
        <ChatPanel sidebarVisible={sidebarVisible} />
      </section>
    </main>
  );
}
