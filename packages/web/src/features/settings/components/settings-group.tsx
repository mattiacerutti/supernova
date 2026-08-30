import type {ReactNode} from "react";

interface SettingsGroupProps {
  children: ReactNode;
  contained?: boolean;
  title: string;
}

export function SettingsGroup(props: SettingsGroupProps) {
  const {children, contained = true, title} = props;

  return (
    <section>
      <h2 className="mb-2.5 px-2 text-sm text-ink-muted">{title}</h2>
      {contained ? <div className="overflow-hidden rounded-2xl corner-superellipse/1.3 bg-surface-raised divide-y divide-border-muted">{children}</div> : children}
    </section>
  );
}

interface SettingsRowProps {
  control: ReactNode;
  description?: string;
  title: string;
}

export function SettingsRow(props: SettingsRowProps) {
  const {control, description, title} = props;

  return (
    <div className="px-4 py-2.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="flex min-h-6 items-center text-sm text-ink">{title}</h3>
          {description && <p className="text-xs leading-4 text-ink-muted">{description}</p>}
        </div>
        <div className="w-full shrink-0 sm:w-auto">{control}</div>
      </div>
    </div>
  );
}
