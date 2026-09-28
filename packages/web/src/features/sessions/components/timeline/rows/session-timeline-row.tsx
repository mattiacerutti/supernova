import {memo} from "react";
import type {ReactNode} from "react";
import MessageActions from "@/features/sessions/components/timeline/items/message-actions";
import AssistantMessage from "@/features/sessions/components/timeline/items/assistant/assistant-message";
import AssistantCompaction from "@/features/sessions/components/timeline/items/assistant/assistant-compaction";
import UserMessage from "@/features/sessions/components/timeline/items/user/user-message";
import AssistantReasoning from "@/features/sessions/components/timeline/items/assistant/assistant-reasoning";
import AssistantTurnWork from "@/features/sessions/components/timeline/items/work/assistant-turn-work";
import AssistantWork from "@/features/sessions/components/timeline/items/work/assistant-work";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

interface SessionTimelineRowProps {
  readonly item: SessionTimelineItem;
  readonly onForkFromTurn?: (turnId: string) => void;
  readonly onRevertToMessage?: (turnId: string) => void;
}

interface FinalWorkProps {
  readonly children: ReactNode;
  readonly timestamp: string;
}

/** A settled turn that ended on work (abort, error) stamps its last item with the time only. */
function FinalWork(props: FinalWorkProps) {
  const {children, timestamp} = props;

  return (
    <div className="group/message">
      {children}
      <MessageActions copyText="" timestamp={timestamp} />
    </div>
  );
}

const SessionTimelineRow = memo(function SessionTimelineRow(props: SessionTimelineRowProps) {
  const {item, onForkFromTurn, onRevertToMessage} = props;

  switch (item.type) {
    case "user":
      return <UserMessage message={item.message} onRevertToMessage={onRevertToMessage} turnId={item.turnId} />;
    case "assistant":
      return <AssistantMessage event={item.event} final={item.final} live={item.live} onForkFromTurn={onForkFromTurn} turnId={item.turnId} />;
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
