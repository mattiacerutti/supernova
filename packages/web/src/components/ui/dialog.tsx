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
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <BaseDialog.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div
            className={cn("relative z-50 flex h-[min(calc(100svh-1rem),32rem)] w-[min(calc(100vw-1rem),40rem)] flex-col items-center overflow-visible", containerClassName)}
            data-slot="dialog-container"
          >
            <BaseDialog.Popup
              className={cn(
                "pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#18181b] shadow-xl shadow-black/40",
                className
              )}
              data-slot="dialog-content"
            >
              <div className="flex shrink-0 items-center justify-between px-5 pt-5" data-slot="dialog-header">
                <BaseDialog.Title className="text-base font-medium text-neutral-100" data-slot="dialog-title">
                  {title}
                </BaseDialog.Title>
                <BaseDialog.Close
                  aria-label="Close dialog"
                  className="grid size-7 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-white/5 hover:text-neutral-300"
                  data-slot="dialog-close-button"
                >
                  <Icon name="x" size="md" />
                </BaseDialog.Close>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-slot="dialog-body">
                {children}
              </div>
            </BaseDialog.Popup>
          </div>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
