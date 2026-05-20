import {Toast} from "@base-ui/react/toast";
import {useId, type ReactNode} from "react";
import Icon from "@/components/ui/icon";
import {toastManager} from "@/components/ui/toast-manager";
import {cn} from "@/lib/cn";

type ToastObject = ReturnType<typeof Toast.useToastManager>["toasts"][number];

function ToastList() {
  const {toasts} = Toast.useToastManager();

  return toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />);
}

function ToastItem(props: {readonly toast: ToastObject}) {
  const {toast} = props;
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Toast.Root
      className={cn(
        "absolute right-2 -bottom-1 z-[calc(1000-var(--toast-index))]",
        "w-full rounded-2xl border border-white/10 bg-neutral-800 p-3",
        "select-text",

        // Stack tuning
        "[--expanded-offset-y:calc(var(--toast-offset-y)*-1+(var(--toast-index)*var(--expanded-gap)*-1)+var(--toast-swipe-movement-y))]",
        "[--peek:0.75rem]",
        "[--expanded-gap:0.5rem]",
        "[--scale:calc(max(0.85,1-(var(--toast-index)*0.06)))]",

        // Collapsed stack position
        "origin-bottom",
        "transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))))_scale(var(--scale))]",

        // Expanded stack position
        "data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--expanded-offset-y))_scale(1)]",
        "after:absolute after:inset-x-0 after:top-full after:h-[calc(var(--expanded-gap)+1px)] after:content-['']",

        // Enter animation
        "data-starting-style:transform-[translateY(150%)_scale(1)]",
        "data-starting-style:opacity-0",

        // Normal exit animation
        "data-ending-style:opacity-0",
        "[&[data-ending-style]:not([data-swipe-direction])]:transform-[translateY(150%)_scale(1)]",

        // Hide limited toasts
        "data-limited:opacity-0",

        // Animation
        "transition-[transform,opacity] duration-300 ease-out"
      )}
      toast={toast}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] gap-x-3 overflow-hidden" data-base-ui-swipe-ignore>
        <div className="col-start-1 row-start-1 min-w-0">
          {toast.title && (
            <h2 className="m-0 wrap-break-word text-sm leading-6 text-neutral-200" id={titleId}>
              {toast.title}
            </h2>
          )}
        </div>

        <Toast.Close
          aria-label="Close"
          className="col-start-2 row-start-1 self-center flex items-center justify-center rounded-md p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          <Icon name="x" size="sm" />
        </Toast.Close>

        <div className="col-start-1 row-start-2 min-w-0">
          {toast.description && (
            <p className="mt-0.5 mb-0 wrap-break-word text-xs text-neutral-400" id={descriptionId}>
              {toast.description}
            </p>
          )}
        </div>

        {/* row 2 / column 2 intentionally empty */}
      </div>
    </Toast.Root>
  );
}

interface ToastProviderProps {
  readonly children: ReactNode;
}

export default function ToastProvider(props: ToastProviderProps) {
  const {children} = props;

  return (
    <Toast.Provider toastManager={toastManager}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed top-auto right-4 bottom-4 z-80 mx-auto flex w-62.5 sm:right-8 sm:bottom-8 sm:w-75">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
