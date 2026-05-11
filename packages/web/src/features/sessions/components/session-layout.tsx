import type {ReactNode} from "react";
import type {AppEnvironment} from "@/app/app-environment";
import {cn} from "@/lib/cn";

interface ISessionLayoutProps {
  readonly appEnvironment: AppEnvironment;
  readonly composer: ReactNode;
  readonly timeline: ReactNode;
  readonly title: ReactNode;
}

export default function SessionLayout(props: ISessionLayoutProps) {
  const {appEnvironment, composer, timeline, title} = props;
  const titleOffset = appEnvironment === "mac" ? "left-48" : appEnvironment === "web" ? "left-12" : "left-20";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="-mx-4 flex min-w-0 shrink-0 items-center justify-between border-b border-neutral-800 px-4 pb-3 pt-2.5">
        <h1 className={cn("sticky min-w-0 max-w-xs truncate text-sm font-medium text-neutral-200", titleOffset)}>{title}</h1>
      </header>

      {timeline}
      {composer}
    </div>
  );
}
