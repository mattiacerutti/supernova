import type {HTMLAttributes, ReactNode} from "react";
import {LayoutGroup, motion} from "framer-motion";
import type {AppEnvironment} from "@/lib/app-environment";
import AttachmentDropOverlay from "@/features/sessions/components/attachments/attachment-drop-overlay";
import {cn} from "@/lib/cn";

interface SessionLayoutProps {
  readonly appEnvironment: AppEnvironment;
  readonly attachmentDropOverlayVisible?: boolean;
  readonly attachmentDropZoneProps?: Pick<HTMLAttributes<HTMLDivElement>, "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop">;
  readonly composer: ReactNode;
  readonly viewActions?: ReactNode;
  readonly timeline: ReactNode;
  readonly title: ReactNode;
  readonly titleActions?: ReactNode;
  readonly workspacePanel?: ReactNode;
}

export default function SessionLayout(props: SessionLayoutProps) {
  const {appEnvironment, attachmentDropOverlayVisible = false, attachmentDropZoneProps, composer, timeline, title, titleActions, viewActions, workspacePanel} = props;
  const titleOffset = appEnvironment === "mac" ? "left-48" : appEnvironment === "web" ? "left-12" : "left-29";

  return (
    <div className="@container relative flex min-h-0 min-w-0 flex-1">
      <div {...attachmentDropZoneProps} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 min-w-0 shrink-0 items-center border-b border-border-muted px-4">
          <LayoutGroup>
            <div className={cn("sticky z-20 flex h-5 min-w-0 items-center gap-1.5 overflow-visible", titleOffset)}>
              <motion.h1 className="min-w-0 max-w-xs truncate text-sm font-medium leading-5 text-ink" layout="position" transition={{duration: 0.18, ease: "easeOut"}}>
                {title}
              </motion.h1>
              {titleActions && (
                <motion.div className="shrink-0" layout="position" transition={{duration: 0.18, ease: "easeOut"}}>
                  {titleActions}
                </motion.div>
              )}
            </div>
          </LayoutGroup>
        </header>

        {timeline}
        {composer}
        {attachmentDropOverlayVisible && <AttachmentDropOverlay />}
      </div>

      {workspacePanel}

      {/* Raised above the titlebar drag region so it stays clickable, and inset so
          it clears native window controls that overlay this corner. */}
      {viewActions && <div className="absolute right-0 top-0 z-20 flex h-12 items-center gap-1 pr-3 mr-(--window-controls-right-inset)">{viewActions}</div>}
    </div>
  );
}
