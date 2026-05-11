import type {ReactNode} from "react";
import {Dialog as BaseDialog} from "@base-ui/react/dialog";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

interface IDialogProps {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: ReactNode;
}

export default function Dialog(props: IDialogProps) {
  const {children, className, containerClassName, onOpenChange, open, title} = props;

  return (
    <BaseDialog.Root onOpenChange={onOpenChange} open={open}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/55 opacity-100 backdrop-blur-[1px] transition-opacity duration-150 ease-out data-closed:opacity-0 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <BaseDialog.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div
            className={cn("relative z-50 flex h-[min(calc(100svh-1rem),32rem)] w-[min(calc(100vw-1rem),40rem)] flex-col items-center overflow-visible", containerClassName)}
            data-slot="dialog-container"
          >
            <BaseDialog.Popup
              className={cn(
                "pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900",
                "origin-center translate-y-0 scale-100 opacity-100 transition-[opacity,scale,translate] duration-200 ease-out data-closed:translate-y-1 data-closed:scale-[0.985] data-closed:opacity-0 data-ending-style:translate-y-1 data-ending-style:scale-[0.985] data-ending-style:opacity-0 data-starting-style:translate-y-1 data-starting-style:scale-[0.985] data-starting-style:opacity-0",
                className
              )}
              data-slot="dialog-content"
            >
              <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-5" data-slot="dialog-header">
                <BaseDialog.Title className="text-base font-medium text-neutral-200" data-slot="dialog-title">
                  {title}
                </BaseDialog.Title>
                <BaseDialog.Close aria-label="Close dialog" className="grid cursor-pointer place-items-center text-neutral-400 hover:text-neutral-100">
                  <Icon name="x" size="md" className="-mb-0.5" />
                </BaseDialog.Close>
              </div>

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
