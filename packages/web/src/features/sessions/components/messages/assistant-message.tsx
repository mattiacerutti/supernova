import MessageContent from "@/features/sessions/components/messages/message-content";
import MessageActions from "@/features/sessions/components/messages/message-actions";
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
        {event.content.length > 0 && <MessageContent streaming={live}>{event.content}</MessageContent>}
        {event.content.length > 0 && !live && <MessageActions copyText={event.content} />}
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      </div>
    </article>
  );
}
