import {cn} from "@/lib/cn.ts";

interface IAppProps {
  integratedTitleBar?: boolean;
}

export default function App(props: IAppProps) {
  const {integratedTitleBar = false} = props;

  return (
    <main className={cn("min-h-svh text-zinc-100", integratedTitleBar ? "desktop-window" : "bg-zinc-950")}>
      <section className={cn("flex min-h-svh flex-col overflow-hidden", integratedTitleBar ? "desktop-window-frame bg-neutral-900/55" : "bg-zinc-950")}>
        <header className={cn("flex h-16 shrink-0 items-center pr-5", integratedTitleBar ? "desktop-titlebar pl-25" : "pl-6")}>
          <p className="text-sm font-medium text-zinc-500">Topbar</p>
        </header>

        <div className="grid flex-1 place-items-center px-6">
          <p className="text-sm text-zinc-500">Pi Desktop</p>
        </div>
      </section>
    </main>
  );
}
