import {mergeProps} from "@base-ui/react/merge-props";
import {useRender} from "@base-ui/react/use-render";
import type {ComponentProps} from "react";
import {cn} from "@/lib/cn";

export type MarkerVariant = "border" | "default" | "separator";

const markerVariantClasses: Record<MarkerVariant, string> = {
  border: "border-b border-border pb-2",
  default: "",
  separator: "before:mr-1 before:h-px before:min-w-0 before:flex-1 before:bg-border after:ml-1 after:h-px after:min-w-0 after:flex-1 after:bg-border",
};

interface MarkerProps extends useRender.ComponentProps<"div"> {
  variant?: MarkerVariant;
}

/** Displays a status, note, bordered row, or labeled separator. */
function Marker(props: MarkerProps) {
  const {className, render, variant = "default", ...markerProps} = props;

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "group/marker relative flex min-h-4 w-full items-center gap-2 text-left text-sm text-ink-muted [&_svg:not([class*='size-'])]:size-4 [a]:underline [a]:underline-offset-3 [a]:hover:text-ink-strong",
          markerVariantClasses[variant],
          className
        ),
      },
      markerProps
    ),
    render,
    state: {
      slot: "marker",
      variant,
    },
  });
}

/** Renders a decorative marker icon. */
function MarkerIcon(props: ComponentProps<"span">) {
  const {className, ...iconProps} = props;

  return <span aria-hidden="true" className={cn("size-4 shrink-0 [&_svg:not([class*='size-'])]:size-4", className)} data-slot="marker-icon" {...iconProps} />;
}

/** Renders marker text content. */
function MarkerContent(props: ComponentProps<"span">) {
  const {className, ...contentProps} = props;

  return (
    <span
      className={cn(
        "min-w-0 wrap-break-word group-data-[variant=separator]/marker:flex-none group-data-[variant=separator]/marker:text-center *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-ink-strong",
        className
      )}
      data-slot="marker-content"
      {...contentProps}
    />
  );
}

export {Marker, MarkerContent, MarkerIcon};
