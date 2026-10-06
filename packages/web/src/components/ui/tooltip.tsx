import type {ComponentProps, ReactElement, ReactNode} from "react";
import {Tooltip as BaseTooltip} from "@base-ui/react/tooltip";
import {cn} from "@/lib/cn";

/** Hover time before the first tooltip opens; once one is open, neighbours open instantly. */
const OPEN_DELAY_MS = 500;

interface TooltipProviderProps {
  readonly children: ReactNode;
}

/** Shares the open delay across tooltips so moving between triggers does not wait again. */
export function TooltipProvider(props: TooltipProviderProps) {
  const {children} = props;

  return <BaseTooltip.Provider delay={OPEN_DELAY_MS}>{children}</BaseTooltip.Provider>;
}

interface TooltipProps {
  readonly align?: ComponentProps<typeof BaseTooltip.Positioner>["align"];
  /** The trigger. It receives the hover and focus handlers, so it must be a DOM element or forward its props. */
  readonly children: ReactElement;
  readonly className?: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
  readonly side?: ComponentProps<typeof BaseTooltip.Positioner>["side"];
  readonly sideOffset?: ComponentProps<typeof BaseTooltip.Positioner>["sideOffset"];
}

/** Non-interactive floating information that opens on hover or keyboard focus of its trigger. */
export default function Tooltip(props: TooltipProps) {
  const {align = "center", children, className, content, disabled, side = "top", sideOffset = 6} = props;

  return (
    <BaseTooltip.Root disableHoverablePopup disabled={disabled}>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner align={align} className="z-50 outline-none" side={side} sideOffset={sideOffset}>
          <BaseTooltip.Popup
            className={cn(
              "rounded-2xl corner-superellipse/1.3 border border-border bg-surface-drawer text-ink shadow-2xl shadow-black/35 outline-none",
              "origin-(--transform-origin) scale-100 transform-gpu opacity-100 will-change-[opacity,transform] transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-[0.985] data-ending-style:opacity-0 data-starting-style:scale-[0.985] data-starting-style:opacity-0 data-instant:transition-none",
              className
            )}
            data-slot="tooltip"
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
