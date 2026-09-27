import {LayoutGroup, motion, useReducedMotion} from "framer-motion";
import type {HTMLAttributes, ReactNode} from "react";
import {appEnvironment} from "@/config/app-environment";
import {cn} from "@/lib/cn";

const TITLE_TRANSITION = {duration: 0.18, ease: "easeOut"} as const;
const DOCK_TRANSITION = {type: "spring", visualDuration: 0.2, bounce: 0} as const;
const TIMELINE_ENTER_TRANSITION = {delay: 0.08, duration: 0.25, ease: "easeOut"} as const;

// The title clears the window controls and titlebar buttons, which differ per host.
const TITLE_OFFSET = {mac: "left-48", web: "left-12", windows: "left-29", linux: "left-29"}[appEnvironment];

type DropZoneProps = Pick<HTMLAttributes<HTMLDivElement>, "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop">;

interface SessionLayoutProps extends DropZoneProps {
  /** Main column: header, then timeline, then composer. */
  readonly children: ReactNode;
  /** Rendered beside the main column, typically the workspace panel. */
  readonly aside?: ReactNode;
  /** Rendered over the whole layout, above the header. */
  readonly overlay?: ReactNode;
}

/** Frame of the session screen: a main column with a fixed-height header row, plus optional aside and overlay slots. */
export default function SessionLayout(props: SessionLayoutProps) {
  const {aside, children, overlay, ...dropZoneProps} = props;

  return (
    <div className="@container relative flex min-h-0 min-w-0 flex-1">
      <div {...dropZoneProps} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>

      {aside}
      {overlay}
    </div>
  );
}

interface SessionHeaderProps {
  readonly children?: ReactNode;
  /** Rendered right after the title and animated with it. */
  readonly actions?: ReactNode;
}

/** Title row. Slot children with the title; `actions` follow it. */
export function SessionHeader(props: SessionHeaderProps) {
  const {actions, children} = props;

  return (
    <header className="flex h-12 min-w-0 shrink-0 items-center border-b border-border-muted px-4">
      <LayoutGroup>
        <div className={cn("sticky z-20 flex h-5 min-w-0 items-center gap-1.5 overflow-visible", TITLE_OFFSET)}>
          <motion.h1 className="min-w-0 max-w-xs truncate text-sm font-medium leading-5 text-ink" layout="position" transition={TITLE_TRANSITION}>
            {children}
          </motion.h1>
          {actions && (
            <motion.div className="shrink-0" layout="position" transition={TITLE_TRANSITION}>
              {actions}
            </motion.div>
          )}
        </div>
      </LayoutGroup>
    </header>
  );
}

interface SessionBodyProps {
  readonly composer: ReactNode;
  /** Shown above a centered composer before the session exists. Removing it docks the composer at the bottom. */
  readonly hero?: ReactNode;
  readonly timeline?: ReactNode;
}

/** Timeline and composer. With a hero the composer sits centered under it; without one it docks below the timeline, animating the same element. */
export function SessionBody(props: SessionBodyProps) {
  const {composer, hero, timeline} = props;
  const reduceMotion = useReducedMotion();
  const centered = hero !== undefined;

  return (
    <>
      {centered && <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-end px-4 md:px-6">{hero}</div>}
      <motion.div
        className={cn("flex min-h-0 flex-1 flex-col", centered && "hidden")}
        animate={centered ? {opacity: 0, y: 25} : {opacity: 1, y: 0}}
        initial={false}
        transition={reduceMotion ? {duration: 0} : TIMELINE_ENTER_TRANSITION}
      >
        {!centered && timeline}
      </motion.div>
      <motion.div className="relative z-20" layout={reduceMotion ? false : "position"} transition={DOCK_TRANSITION}>
        {composer}
      </motion.div>
      <div className={cn("min-h-0", centered && "flex-1")} />
    </>
  );
}

interface SessionViewActionsProps {
  readonly children: ReactNode;
}

/** Top-right controls. Raised above the titlebar drag region so they stay clickable, and inset to clear native window controls. */
export function SessionViewActions(props: SessionViewActionsProps) {
  const {children} = props;

  return <div className="absolute right-0 top-0 z-20 flex h-12 items-center gap-1 pr-3 mr-(--window-controls-right-inset)">{children}</div>;
}
