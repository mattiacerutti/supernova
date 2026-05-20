import AssistantMessageContent from "@/features/sessions/components/timeline/items/assistant/assistant-message-content";
import MessageActions from "@/features/sessions/components/timeline/items/actions/message-actions";
import type {SessionAssistantEvent} from "@/features/sessions/types/session-timeline-item";

interface AssistantMessageProps {
  event: SessionAssistantEvent;
  live: boolean;
}

export default function AssistantMessage(props: AssistantMessageProps) {
  const {event, live} = props;

  const error = event.error;

  return (
    <article className="group/message">
      <div className="max-w-3xl">
        {event.content.length > 0 && <AssistantMessageContent streaming={live}>{event.content}</AssistantMessageContent>}
        {event.content.length > 0 && !live && <MessageActions copyText={event.content} />}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </article>
  );
}
