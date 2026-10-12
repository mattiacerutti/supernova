import {Toast} from "@base-ui/react/toast";
import {useId} from "react";
import Icon from "@/components/ui/icon";
import Button from "@/components/ui/button";
import {cn} from "@/lib/cn";
import type {ToastManager} from "@/lib/toast";
import {toastManager, useSessionToastManagers} from "@/lib/toast";

type ToastObject = ReturnType<typeof Toast.useToastManager>["toasts"][number];

function ToastList() {
  const {toasts} = Toast.useToastManager();
  return toasts.map((toast) => <ToastItem key={toast.id} toast={toast} />);
}

interface ToastItemProps {
  readonly toast: ToastObject;
}

function ToastItem(props: ToastItemProps) {
  const {toast} = props;
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Toast.Root
      className={cn(
        "absolute right-2 -bottom-1 z-[calc(1000-var(--toast-index))]",
        "w-full rounded-2xl corner-superellipse/1.3 border border-border bg-surface-drawer p-3 shadow-2xl shadow-black/35",
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
            <h2 className="m-0 flex items-start gap-1.5 wrap-break-word text-sm leading-6 text-ink" id={titleId}>
              {toast.type === "warning" && <Icon aria-label="Warning" className="mt-1.25 shrink-0 text-warning-ink" name="alert-triangle" role="img" size="xs" />}
              {toast.type === "error" && <Icon aria-label="Error" className="mt-1.25 shrink-0 text-danger-ink" name="circle-alert" role="img" size="xs" />}
              <span className="min-w-0">{toast.title}</span>
            </h2>
          )}
        </div>

        <Toast.Close
          aria-label="Close"
          className="col-start-2 row-start-1 self-center flex items-center justify-center rounded-md p-1 text-ink-muted transition-colors hover:bg-overlay-pressed hover:text-ink-strong"
        >
          <Icon name="x" size="sm" />
        </Toast.Close>

        <div className="col-start-1 row-start-2 min-w-0">
          {toast.description && (
            <p className="mt-0.5 mb-0 wrap-break-word text-xs text-ink-muted" id={descriptionId}>
              {toast.description}
            </p>
          )}
          {toast.actionProps && (
            <Toast.Action
              {...toast.actionProps}
              render={
                <Button className="mt-2.5 w-auto px-2.5 py-1 text-xs" variant="filled">
                  {toast.actionProps.children}
                </Button>
              }
            />
          )}
        </div>

        {/* row 2 / column 2 intentionally empty */}
      </div>
    </Toast.Root>
  );
}

interface ToastQueueProps {
  readonly manager: ToastManager;
  /** A hidden queue keeps its toasts (and their timers) but shows nothing; a queue's toasts live in its provider. */
  readonly hidden?: boolean;
}

/** One queue's toasts, stacked at the bottom-right corner. Below dialogs and menus (z-50), so a dialog covers toasts. */
function ToastQueue(props: ToastQueueProps) {
  const {hidden = false, manager} = props;
  return (
    <Toast.Provider toastManager={manager}>
      <Toast.Portal>
        <Toast.Viewport className={cn("fixed top-auto right-4 bottom-4 z-45 mx-auto flex w-62.5 sm:right-8 sm:bottom-8 sm:w-75", hidden && "hidden")}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

interface ToastViewportProps {
  /** The session whose page is open; its toasts show beside the app-wide ones. Other sessions' toasts wait, timers running. */
  readonly openSessionId: string | undefined;
}

/** Where toasts appear: the app-wide queue, and every session's own, only the open session's shown. Render once. */
export default function ToastViewport(props: ToastViewportProps) {
  const {openSessionId} = props;
  const sessions = useSessionToastManagers();
  return (
    <>
      <ToastQueue manager={toastManager} />
      {sessions.map(([sessionId, manager]) => (
        <ToastQueue hidden={sessionId !== openSessionId} key={sessionId} manager={manager} />
      ))}
    </>
  );
}
