import type {ReactNode} from "react";
import type {TimelineSpacing} from "@/features/sessions/lib/timeline/rows/timeline-rows";
import {cn} from "@/lib/cn";

const GAP_CLASSES: Record<TimelineSpacing, string> = {apart: "pb-8", close: "pb-3"};

interface SessionTimelineItemFrameProps {
  readonly children: ReactNode;
  readonly gap: TimelineSpacing | undefined;
}

export default function SessionTimelineItemFrame(props: SessionTimelineItemFrameProps) {
  const {children, gap} = props;

  return <div className={cn("mx-auto w-full max-w-conversation px-5 [overflow-anchor:none] md:px-8", gap && GAP_CLASSES[gap])}>{children}</div>;
}
