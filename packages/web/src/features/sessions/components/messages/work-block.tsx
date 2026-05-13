import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import MessageActions from "@/features/sessions/components/messages/message-actions";
import MessageContent from "@/features/sessions/components/messages/message-content";
import {formatDuration, getWorkIconName} from "@/features/sessions/lib/session-render-items";
import type {SessionWorkEvent} from "@/features/sessions/types/session-render-item";
import type {WorkSessionRenderItem} from "@/features/sessions/types/session-render-item";
import {cn} from "@/lib/cn";

function WorkEvent(props: {event: SessionWorkEvent; live: boolean}) {
  const {event, live} = props;

  if (event.type === "tool") {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <Icon name={getWorkIconName(event)} size="sm" />
        <span>{event.tool?.summary ?? "Ran tool"}</span>
      </div>
    );
  }

  if (event.type === "reasoning") {
    return (
      <div className="text-neutral-200">
        <MessageContent className="text-neutral-300" streaming={live}>
          {event.content}
        </MessageContent>
      </div>
    );
  }

  return null;
}

interface WorkBlockProps {
  item: WorkSessionRenderItem;
}

function workCopyText(events: SessionWorkEvent[]): string {
  return events
    .filter((event) => event.type === "reasoning")
    .map((event) => event.content)
    .join("\n\n");
}

export default function WorkBlock(props: WorkBlockProps) {
  const {item} = props;
  const [expanded, setExpanded] = useState(false);

  const showExpanded = item.live || expanded;
  const copyText = item.collapsible ? "" : workCopyText(item.events);

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
  };

  if (item.live || !item.collapsible) {
    return (
      <section className="group/message space-y-3">
        {item.events.map((event) => (
          <WorkEvent event={event} key={event.id} live={item.live} />
        ))}
        {!item.live && <MessageActions copyText={copyText} />}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <Button
        className="group inline-flex w-fit select-none gap-1.5 px-0 py-0 text-sm text-neutral-500 hover:text-neutral-30 items-center 0"
        onClick={handleToggle}
        variant="ghost"
      >
        <span>Worked for {formatDuration(item.durationMs)}</span>
        <Icon className={cn("transition-transform duration-160 ease-out", showExpanded && "rotate-90")} name="chevron-right" size="xs" />
      </Button>
      <div className="h-px bg-white/7" />
      <div
        className="grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-300 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
        data-expanded={showExpanded}
      >
        <div className="space-y-5 overflow-hidden">
          {item.events.map((event) => (
            <WorkEvent event={event} key={event.id} live={false} />
          ))}
        </div>
      </div>
    </section>
  );
}
