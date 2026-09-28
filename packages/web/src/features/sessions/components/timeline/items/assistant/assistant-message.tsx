import AssistantMessageContent from "@/features/sessions/components/timeline/items/assistant/assistant-message-content";
import MessageActions from "@/features/sessions/components/timeline/items/message-actions";
import type {SessionAssistantEvent} from "@/features/sessions/types/session-timeline-item";

interface AssistantMessageProps {
  readonly event: SessionAssistantEvent;
  readonly final: boolean;
  readonly live: boolean;
  readonly onForkFromTurn?: (turnId: string) => void;
  readonly turnId: string;
}

export default function AssistantMessage(props: AssistantMessageProps) {
  const {event, final, live, onForkFromTurn, turnId} = props;

  // The runtime emits assistant errors as their own content-less events; render them like stream errors.
  if (event.error) return <p className="text-sm text-danger-ink">{event.error}</p>;

  return (
    <article className="group/message">
      <div className="max-w-3xl">
        {event.content.length > 0 && <AssistantMessageContent streaming={live}>{event.content}</AssistantMessageContent>}
        {final && <MessageActions copyText={event.content} onFork={onForkFromTurn && (() => onForkFromTurn(turnId))} timestamp={event.timestamp} />}
      </div>
    </article>
  );
}
