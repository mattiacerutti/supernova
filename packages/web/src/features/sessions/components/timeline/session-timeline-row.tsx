import {memo} from "react";
import type {ReactNode} from "react";
import MessageActions from "@/features/sessions/components/timeline/items/actions/message-actions";
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

/** A settled turn that ended on work (abort, error) stamps its last item with the time only. */
function FinalWork(props: {readonly children: ReactNode; readonly timestamp: string}) {
  const {children, timestamp} = props;

  return (
    <div className="group/message">
      {children}
      <MessageActions copyText="" timestamp={timestamp} />
    </div>
  );
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
      return item.final ? (
        <FinalWork timestamp={item.event.timestamp}>
          <AssistantReasoning item={item} />
        </FinalWork>
      ) : (
        <AssistantReasoning item={item} />
      );
    case "turn-work":
      return <AssistantTurnWork item={item} />;
    case "work":
      return item.final ? (
        <FinalWork timestamp={item.events.at(-1)?.timestamp ?? ""}>
          <AssistantWork item={item} />
        </FinalWork>
      ) : (
        <AssistantWork item={item} />
      );
  }
});

export default SessionTimelineRow;
