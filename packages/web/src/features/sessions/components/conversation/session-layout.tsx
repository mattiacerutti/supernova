import {LayoutGroup, motion} from "framer-motion";
import type {HTMLAttributes, ReactNode} from "react";
import {appEnvironment} from "@/config/app-environment";
import {cn} from "@/lib/cn";

const TITLE_TRANSITION = {duration: 0.18, ease: "easeOut"} as const;

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
  readonly children: ReactNode;
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

interface SessionViewActionsProps {
  readonly children: ReactNode;
}

/** Top-right controls. Raised above the titlebar drag region so they stay clickable, and inset to clear native window controls. */
export function SessionViewActions(props: SessionViewActionsProps) {
  const {children} = props;

  return <div className="absolute right-0 top-0 z-20 flex h-12 items-center gap-1 pr-3 mr-(--window-controls-right-inset)">{children}</div>;
}
