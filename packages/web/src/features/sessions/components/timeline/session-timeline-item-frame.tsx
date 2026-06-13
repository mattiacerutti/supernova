import type {ReactNode} from "react";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

interface SessionTimelineItemFrameProps {
  readonly children: ReactNode;
  readonly item: SessionTimelineItem;
}

export default function SessionTimelineItemFrame(props: SessionTimelineItemFrameProps) {
  const {children, item} = props;

  return <div className={cn("mx-auto w-full max-w-3xl px-5 [overflow-anchor:none] md:px-8", item.spacing === "work" ? "pb-4" : "pb-8")}>{children}</div>;
}
