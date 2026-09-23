import {memo} from "react";
import AssistantMessage from "@/features/sessions/components/timeline/items/assistant-message";
import AssistantCompaction from "@/features/sessions/components/timeline/items/assistant-compaction";
import UserMessage from "@/features/sessions/components/timeline/items/user-message";
import AssistantReasoning from "@/features/sessions/components/timeline/items/assistant-reasoning";
import AssistantTurnWork from "@/features/sessions/components/timeline/items/assistant-turn-work";
import AssistantWork from "@/features/sessions/components/timeline/items/assistant-work";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

interface SessionTimelineRowProps {
  readonly item: SessionTimelineItem;
  readonly onRevertToMessage?: (turnId: string) => void;
}

const SessionTimelineRow = memo(function SessionTimelineRow(props: SessionTimelineRowProps) {
  const {item, onRevertToMessage} = props;

  switch (item.type) {
    case "user":
      return <UserMessage message={item.message} onRevertToMessage={onRevertToMessage} turnId={item.turnId} />;
    case "assistant":
      return <AssistantMessage event={item.event} final={item.final} live={item.live} />;
    case "compaction":
      return <AssistantCompaction item={item} />;
    case "reasoning":
      return <AssistantReasoning item={item} />;
    case "turn-work":
      return <AssistantTurnWork item={item} />;
    case "work":
      return <AssistantWork item={item} />;
  }
});

export default SessionTimelineRow;
