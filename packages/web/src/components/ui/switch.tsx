import {Switch as BaseSwitch} from "@base-ui/react/switch";
import type {ComponentProps} from "react";
import {cn} from "@/lib/cn";

type SwitchProps = ComponentProps<typeof BaseSwitch.Root>;

/** Accessible Base UI switch styled for Supernova controls. */
export default function Switch(props: SwitchProps) {
  const {className, ...switchProps} = props;

  return (
    <BaseSwitch.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-raised outline-none transition-colors data-checked:border-accent data-checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent-focus/60 data-disabled:cursor-default data-disabled:opacity-50",
        className
      )}
      {...switchProps}
    >
      <BaseSwitch.Thumb className="block size-4.5 translate-x-0.5 rounded-full bg-white transition-transform data-checked:translate-x-4.5" />
    </BaseSwitch.Root>
  );
}
