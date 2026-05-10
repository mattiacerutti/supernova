import MessageContent from "@/features/sessions/components/messages/message-content";
import type {SessionAssistantEvent} from "@/features/sessions/types/session-render-item";

interface IAssistantMessageProps {
  event: SessionAssistantEvent;
  live: boolean;
}

export default function AssistantMessage(props: IAssistantMessageProps) {
  const {event, live} = props;

  const error = event.error;

  return (
    <article>
      <div className="max-w-3xl">
        {event.content.length > 0 && <MessageContent streaming={live}>{event.content}</MessageContent>}
        {error && <p className="mt-3 rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      </div>
    </article>
  );
}
