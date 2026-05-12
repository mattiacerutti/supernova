import type {HTMLAttributes, ReactNode} from "react";
import type {AppEnvironment} from "@/app/app-environment";
import AttachmentDropOverlay from "@/features/sessions/components/attachments/attachment-drop-overlay";
import {cn} from "@/lib/cn";

interface SessionLayoutProps {
  readonly appEnvironment: AppEnvironment;
  readonly attachmentDropOverlayVisible?: boolean;
  readonly attachmentDropZoneProps?: Pick<HTMLAttributes<HTMLDivElement>, "onDragEnter" | "onDragLeave" | "onDragOver" | "onDrop">;
  readonly composer: ReactNode;
  readonly timeline: ReactNode;
  readonly title: ReactNode;
}

export default function SessionLayout(props: SessionLayoutProps) {
  const {appEnvironment, attachmentDropOverlayVisible = false, attachmentDropZoneProps, composer, timeline, title} = props;
  const titleOffset = appEnvironment === "mac" ? "left-48" : appEnvironment === "web" ? "left-12" : "left-20";

  return (
    <div {...attachmentDropZoneProps} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="-mx-4 flex min-w-0 shrink-0 items-center justify-between border-b border-neutral-800 px-4 pb-3 pt-2.5">
        <h1 className={cn("sticky min-w-0 max-w-xs truncate text-sm font-medium text-neutral-200", titleOffset)}>{title}</h1>
      </header>

      {timeline}
      {composer}
      {attachmentDropOverlayVisible && <AttachmentDropOverlay />}
    </div>
  );
}
