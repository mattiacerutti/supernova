import {useState} from "react";
import Icon from "@/components/ui/icon";
import {Marker, MarkerContent} from "@/components/ui/marker";
import SessionTimelineItemFrame from "@/features/sessions/components/timeline/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/session-timeline-row";
import {formatDuration} from "@/features/sessions/lib/timeline/work-timeline-items";
import type {TurnWorkSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

interface AssistantTurnWorkProps {
  readonly item: TurnWorkSessionTimelineItem;
}

export default function AssistantTurnWork(props: AssistantTurnWorkProps) {
  const {item} = props;
  const [expanded, setExpanded] = useState(false);

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
  };

  return (
    <section className="space-y-2">
      <Marker className="cursor-pointer select-none gap-1.5 px-0 pt-0 hover:text-ink-muted" onClick={handleToggle} render={<button type="button" />} variant="border">
        <MarkerContent>Worked for {formatDuration(item.durationMs)}</MarkerContent>
        <Icon className={cn("transition-transform duration-160 ease-out", expanded && "rotate-90")} name="chevron-right" size="xs" />
      </Marker>
      <div
        className="grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-300 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
        data-expanded={expanded}
      >
        <div className="overflow-hidden">
          {/* Same rows and spacing as the live timeline, minus the frame's horizontal gutter. */}
          <div className="pt-3 [&>div]:px-0">
            {item.items.map((child) => (
              <SessionTimelineItemFrame item={child} key={child.id}>
                <SessionTimelineRow item={child} />
              </SessionTimelineItemFrame>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
