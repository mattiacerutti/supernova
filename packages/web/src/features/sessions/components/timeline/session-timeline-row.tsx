import {memo} from "react";
import AssistantMessage from "@/features/sessions/components/messages/assistant-message";
import UserMessage from "@/features/sessions/components/messages/user-message";
import WorkBlock from "@/features/sessions/components/messages/work/work-block";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

interface SessionTimelineRowProps {
  readonly item: SessionTimelineItem;
}

const SessionTimelineRow = memo(function SessionTimelineRow(props: SessionTimelineRowProps) {
  const {item} = props;

  switch (item.type) {
    case "user":
      return <UserMessage message={item.message} />;
    case "assistant":
      return <AssistantMessage event={item.event} live={item.live} />;
    case "work":
      return <WorkBlock item={item} />;
  }
});

export default SessionTimelineRow;
