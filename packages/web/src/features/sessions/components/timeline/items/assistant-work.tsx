import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import MessageActions from "@/features/sessions/components/timeline/items/actions/message-actions";
import AssistantMessageContent from "@/features/sessions/components/timeline/items/assistant/assistant-message-content";
import ToolEvent from "@/features/sessions/components/timeline/items/assistant/tools/tool-event";
import type {ToolDetailMode} from "@/features/sessions/components/timeline/items/assistant/tools/tool-event";
import {formatDuration} from "@/features/sessions/lib/timeline/work-timeline-items";
import type {SessionWorkEvent, WorkSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

function generateCopyableText(events: readonly SessionWorkEvent[]): string {
  return events
    .filter((event) => event.type === "reasoning")
    .map((event) => event.content)
    .join("\n\n");
}

interface WorkEventProps {
  event: SessionWorkEvent;
  live: boolean;
  toolDetailMode: ToolDetailMode;
}

function WorkEvent(props: WorkEventProps) {
  const {event, live, toolDetailMode} = props;

  if (event.type === "tool") {
    return <ToolEvent event={event} mode={toolDetailMode} />;
  }

  if (event.type === "reasoning") {
    return (
      <div className="text-neutral-200">
        <AssistantMessageContent className="text-neutral-300" streaming={live}>
          {event.content}
        </AssistantMessageContent>
      </div>
    );
  }

  return null;
}

interface AssistantWorkProps {
  item: WorkSessionTimelineItem;
}

export default function AssistantWork(props: AssistantWorkProps) {
  const {item} = props;
  const [expanded, setExpanded] = useState(false);

  const showExpanded = item.live || expanded;
  const copyText = item.collapsible ? "" : generateCopyableText(item.events);

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
  };

  if (item.live || !item.collapsible) {
    return (
      <section className="group/message flex flex-col gap-5">
        {item.events.map((event) => (
          <WorkEvent event={event} key={event.id} live={item.live} toolDetailMode="visible" />
        ))}
        {!item.live && <MessageActions copyText={copyText} />}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <Button
        className="group inline-flex w-fit select-none gap-1.5 px-0 py-0 text-sm text-neutral-500 hover:text-neutral-400 items-center "
        onClick={handleToggle}
        variant="ghost"
      >
        <span>Worked for {formatDuration(item.durationMs)}</span>
        <Icon className={cn("transition-transform duration-160 ease-out", showExpanded && "rotate-90")} name="chevron-right" size="xs" />
      </Button>
      <div className="h-px bg-white/7" />
      <div
        className="grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-300 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100 data-[expanded=true]:mt-2"
        data-expanded={showExpanded}
      >
        <div className="overflow-hidden flex flex-col gap-3 mt-1">
          {item.events.map((event) => (
            <WorkEvent event={event} live={false} toolDetailMode="collapsible" key={event.id} />
          ))}
        </div>
      </div>
    </section>
  );
}
