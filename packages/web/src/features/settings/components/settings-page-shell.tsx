import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import type {IconName} from "@/components/ui/icon";

interface SettingsPageShellProps {
  children: ReactNode;
  description: string;
  icon: IconName;
  title: string;
}

export default function SettingsPageShell(props: SettingsPageShellProps) {
  const {children, description, icon, title} = props;

  return (
    <div className="scroll-fade-y min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl corner-superellipse/1.3 bg-surface-control text-ink">
            <Icon name={icon} size="md" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-ink-strong">{title}</h1>
            <p className="mt-0.5 truncate text-sm text-ink-muted">{description}</p>
          </div>
        </div>
        <div className="mt-8 space-y-8">{children}</div>
      </div>
    </div>
  );
}
