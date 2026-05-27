import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import AssistantMessageContent from "@/features/sessions/components/timeline/items/assistant/assistant-message-content";
import {formatDuration} from "@/features/sessions/lib/timeline/work-timeline-items";
import type {CompactionSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

interface AssistantCompactionProps {
  readonly item: CompactionSessionTimelineItem;
}

export default function AssistantCompaction(props: AssistantCompactionProps) {
  const {item} = props;
  const [expanded, setExpanded] = useState(false);

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
  };

  return (
    <section className="space-y-2">
      <Button className="group inline-flex w-fit select-none items-center gap-1.5 px-0 py-0 text-sm text-neutral-500 hover:text-neutral-400" onClick={handleToggle} variant="ghost">
        <span>Compacted for {formatDuration(item.durationMs)}</span>
        <Icon className={cn("transition-transform duration-160 ease-out", expanded && "rotate-90")} name="chevron-right" size="xs" />
      </Button>
      <div className="h-px bg-white/7" />
      <div
        className="grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-300 ease-in-out data-[expanded=true]:mt-2 data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
        data-expanded={expanded}
      >
        <div className="mt-1 overflow-hidden">
          <AssistantMessageContent className="text-neutral-300" mode="text">
            {item.event.summary ?? ""}
          </AssistantMessageContent>
        </div>
      </div>
    </section>
  );
}
