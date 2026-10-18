import Icon from "@/components/ui/icon";
import {Marker, MarkerContent} from "@/features/sessions/components/timeline/marker";
import SessionTimelineItemFrame from "@/features/sessions/components/timeline/rows/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/rows/session-timeline-row";
import VirtualWorkList from "@/features/sessions/components/timeline/items/work/virtual-work-list";
import WorkExpansionBody from "@/features/sessions/components/timeline/items/work/work-expansion-body";
import {useWorkExpansion} from "@/features/sessions/hooks/use-work-expansion";
import {formatDuration} from "@/features/sessions/lib/timeline/work/work-timeline-items";
import type {TurnWorkSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

interface AssistantTurnWorkProps {
  readonly item: TurnWorkSessionTimelineItem;
}

export default function AssistantTurnWork(props: AssistantTurnWorkProps) {
  const {item} = props;
  const {expanded, toggle} = useWorkExpansion(item.id);

  return (
    <section className="space-y-2">
      <Marker
        aria-expanded={expanded}
        className="cursor-pointer select-none gap-1.5 px-0 pt-0 hover:text-ink-muted"
        onClick={toggle}
        render={<button type="button" />}
        variant="border"
      >
        <MarkerContent>Worked for {formatDuration(item.durationMs)}</MarkerContent>
        <Icon className={cn("transition-transform duration-160 ease-out", expanded && "rotate-90")} name="chevron-right" size="xs" />
      </Marker>
      <WorkExpansionBody expanded={expanded} turn>
        <VirtualWorkList
          count={item.items.length}
          estimateSize={(index) => (item.items[index]?.type === "work" ? 40 : 86)}
          getKey={(index) => item.items[index]!.id}
          id={item.id}
          renderRow={(index) => {
            const child = item.items[index]!;
            return (
              <div className="[&>div]:px-0">
                <SessionTimelineItemFrame item={child}>
                  <SessionTimelineRow item={child} />
                </SessionTimelineItemFrame>
              </div>
            );
          }}
        />
      </WorkExpansionBody>
    </section>
  );
}
