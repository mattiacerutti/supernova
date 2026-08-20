import {MessageScroller as MessageScrollerPrimitive} from "@shadcn/react/message-scroller";
import type {ComponentProps} from "react";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

/** Provides message-scroller behavior and state to a transcript. */
function MessageScrollerProvider(props: ComponentProps<typeof MessageScrollerPrimitive.Provider>) {
  return <MessageScrollerPrimitive.Provider {...props} />;
}

/** Renders the message-scroller frame. */
function MessageScroller(props: ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  const {className, ...rootProps} = props;

  return (
    <MessageScrollerPrimitive.Root
      className={cn("group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden", className)}
      data-slot="message-scroller"
      {...rootProps}
    />
  );
}

/** Renders the native scrollable message viewport. */
function MessageScrollerViewport(props: ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  const {className, ...viewportProps} = props;

  return (
    <MessageScrollerPrimitive.Viewport
      className={cn(
        "scroll-fade-y size-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain contain-content data-autoscrolling:scrollbar-thumb-transparent data-autoscrolling:scrollbar-track-transparent",
        className
      )}
      data-slot="message-scroller-viewport"
      {...viewportProps}
    />
  );
}

/** Renders the transcript content container. */
function MessageScrollerContent(props: ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  const {className, ...contentProps} = props;

  return <MessageScrollerPrimitive.Content className={cn("flex h-max min-h-full flex-col", className)} data-slot="message-scroller-content" {...contentProps} />;
}

/** Renders a measurable message-scroller row. */
function MessageScrollerItem(props: ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  const {className, scrollAnchor = false, ...itemProps} = props;

  return (
    <MessageScrollerPrimitive.Item
      className={cn("min-w-0 shrink-0 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]", className)}
      data-slot="message-scroller-item"
      scrollAnchor={scrollAnchor}
      {...itemProps}
    />
  );
}

/** Renders a transcript edge navigation button. */
function MessageScrollerButton(props: ComponentProps<typeof MessageScrollerPrimitive.Button>) {
  const {children, className, direction = "end", ...buttonProps} = props;

  return (
    <MessageScrollerPrimitive.Button
      className={cn(
        "absolute inset-s-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-surface-popover text-ink-strong inset-ring-1 inset-ring-border-strong transition-colors duration-200 hover:bg-surface-control data-[active=false]:pointer-events-none data-[direction=end]:bottom-4 data-[direction=start]:top-4 rtl:translate-x-1/2 data-[direction=start]:[&_svg]:rotate-180",
        className
      )}
      data-direction={direction}
      data-slot="message-scroller-button"
      direction={direction}
      {...buttonProps}
    >
      {children ?? (
        <>
          <Icon name="arrow-down" size="sm" />
          <span className="sr-only">{direction === "end" ? "Scroll to latest message" : "Scroll to first message"}</span>
        </>
      )}
    </MessageScrollerPrimitive.Button>
  );
}

export {MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport};
