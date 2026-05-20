import {memo} from "react";
import AssistantMessage from "@/features/sessions/components/timeline/items/assistant-message";
import UserMessage from "@/features/sessions/components/timeline/items/user-message";
import AssistantWork from "@/features/sessions/components/timeline/items/assistant-work";
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
      return <AssistantWork item={item} />;
  }
});

export default SessionTimelineRow;
