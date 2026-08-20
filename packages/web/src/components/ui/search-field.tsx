import type {ComponentProps, ReactNode} from "react";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

interface SearchFieldProps extends Omit<ComponentProps<"input">, "className"> {
  readonly className?: string;
  readonly trailing?: ReactNode;
}

/** Renders the search row used by menus and dialogs, separated by a hairline rule. */
export default function SearchField(props: SearchFieldProps) {
  const {className, trailing, ...inputProps} = props;

  return (
    <div className={cn("flex shrink-0 items-center gap-2.5 border-b border-border-muted px-3 py-2.5 text-ink-faint focus-within:text-ink-muted", className)}>
      <Icon className="shrink-0" name="search" size="sm" />
      <input className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint" {...inputProps} />
      {trailing}
    </div>
  );
}
