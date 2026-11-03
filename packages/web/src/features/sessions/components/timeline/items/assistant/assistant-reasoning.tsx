import AssistantMessageContent from "@/features/sessions/components/timeline/items/assistant/assistant-message-content";
import type {ReasoningSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

interface AssistantReasoningProps {
  readonly item: ReasoningSessionTimelineItem;
}

export default function AssistantReasoning(props: AssistantReasoningProps) {
  const {item} = props;

  return (
    <article className="max-w-conversation">
      <AssistantMessageContent streaming={item.live}>{item.event.content}</AssistantMessageContent>
    </article>
  );
}
