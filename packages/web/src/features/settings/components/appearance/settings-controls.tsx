import type {ReactNode} from "react";
import Button from "@/components/ui/button";
import {cn} from "@/lib/cn";

interface SettingsCardProps {
  children: ReactNode;
  title: string;
}

/** Groups related appearance settings in a bordered panel. */
export function SettingsCard(props: SettingsCardProps) {
  const {children, title} = props;

  return (
    <section>
      <h2 className="mb-3 px-1 text-sm font-medium text-ink-strong">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-overlay-hover divide-y divide-border-muted">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  children?: ReactNode;
  control: ReactNode;
  description?: string;
  title: string;
}

/** Renders a labeled appearance setting and its control. */
export function SettingsRow(props: SettingsRowProps) {
  const {children, control, description, title} = props;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-6 items-center gap-1">
            <h3 className="text-sm font-medium text-ink-strong">{title}</h3>
          </div>
          {description && <p className="text-sm leading-5 text-ink-muted">{description}</p>}
        </div>
        <div className="w-full shrink-0 sm:w-auto">{control}</div>
      </div>
      {children}
    </div>
  );
}

interface SegmentedOption<T extends string> {
  icon?: ReactNode;
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  value: T;
}

/** Selects one value from a small inline set of appearance options. */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const {ariaLabel, onChange, options, value} = props;

  return (
    <div aria-label={ariaLabel} className="flex w-full items-center gap-1 sm:w-auto" role="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            aria-checked={active}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm transition-colors sm:flex-none",
              active ? "bg-overlay-pressed text-ink" : "text-ink-muted hover:bg-overlay-hover hover:text-ink"
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
          >
            {option.icon}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
