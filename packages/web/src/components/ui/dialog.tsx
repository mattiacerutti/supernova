import type {MouseEvent, ReactNode} from "react";
import {Dialog as BaseDialog} from "@base-ui/react/dialog";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

interface DialogProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly containerClassName?: string;
  /** Keeps the title for assistive technology but hides the header row, for dialogs whose content leads with its own input. */
  readonly hideHeader?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenChangeComplete?: (open: boolean) => void;
  readonly open: boolean;
  readonly title: ReactNode;
}

export default function Dialog(props: DialogProps) {
  const {children, className, containerClassName, hideHeader = false, onOpenChange, onOpenChangeComplete, open, title} = props;

  // The dialog is portaled, but React events still bubble through the tree that rendered it. A dialog opened from a
  // clickable row (a sidebar session) must not activate that row when the user clicks inside it.
  const stopPropagation = (event: MouseEvent): void => {
    event.stopPropagation();
  };

  return (
    <BaseDialog.Root onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete} open={open}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className="fixed inset-0 z-50 bg-overlay-scrim opacity-100 transition-opacity duration-150 ease-out data-closed:opacity-0 data-ending-style:opacity-0 data-starting-style:opacity-0"
          onClick={stopPropagation}
        />
        <BaseDialog.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden" onClick={stopPropagation}>
          <div
            className={cn("relative z-50 flex h-[min(calc(100svh-1rem),32rem)] w-[min(calc(100vw-1rem),40rem)] flex-col items-center overflow-visible", containerClassName)}
            data-slot="dialog-container"
          >
            <BaseDialog.Popup
              className={cn(
                "pointer-events-auto relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl corner-superellipse/1.3 border border-border-muted bg-surface-deep shadow-lg/5 before:pointer-events-none before:absolute before:inset-0 before:bg-surface-elevated-secondary/72",
                "origin-center translate-y-0 scale-100 transform-gpu opacity-100 will-change-[opacity,transform] transition-[opacity,scale,translate] duration-200 ease-out data-closed:translate-y-1 data-closed:scale-[0.985] data-closed:opacity-0 data-ending-style:translate-y-1 data-ending-style:scale-[0.985] data-ending-style:opacity-0 data-starting-style:translate-y-1 data-starting-style:scale-[0.985] data-starting-style:opacity-0",
                className
              )}
              data-slot="dialog-content"
            >
              {hideHeader ? (
                <BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>
              ) : (
                <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-5" data-slot="dialog-header">
                  <BaseDialog.Title className="text-base font-medium text-ink" data-slot="dialog-title">
                    {title}
                  </BaseDialog.Title>
                  <BaseDialog.Close aria-label="Close dialog" className="grid cursor-pointer place-items-center text-ink-muted hover:text-ink-strong">
                    <Icon name="x" size="md" className="-mb-0.5" />
                  </BaseDialog.Close>
                </div>
              )}

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5" data-slot="dialog-body">
                {children}
              </div>
            </BaseDialog.Popup>
          </div>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
