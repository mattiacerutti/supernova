import AssistantMessageContent from "@/features/sessions/components/timeline/items/assistant/assistant-message-content";
import MessageActions from "@/features/sessions/components/timeline/items/actions/message-actions";
import type {SessionAssistantEvent} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

interface AssistantMessageProps {
  event: SessionAssistantEvent;
  final: boolean;
  live: boolean;
}

export default function AssistantMessage(props: AssistantMessageProps) {
  const {event, final, live} = props;

  const error = event.error;

  return (
    <article className="group/message">
      <div className="max-w-3xl">
        {event.content.length > 0 && <AssistantMessageContent streaming={live}>{event.content}</AssistantMessageContent>}
        {event.content.length > 0 && final && (live ? <div aria-hidden="true" className="mt-1 h-6" /> : <MessageActions copyText={event.content} timestamp={event.timestamp} />)}
        {error && <p className={cn("text-sm leading-7 text-danger-ink", event.content.length > 0 && "mt-3")}>{error}</p>}
      </div>
    </article>
  );
}
