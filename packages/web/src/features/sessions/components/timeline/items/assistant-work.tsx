import {useState} from "react";
import Icon from "@/components/ui/icon";
import WorkRow from "@/features/sessions/components/timeline/items/assistant/work-row";
import {summarizeWork} from "@/features/sessions/lib/timeline/work-summary";
import type {WorkSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

// Arrival cadence: the first row of a new group waits for the header, later
// rows in the same batch stagger so a burst reads as a continuous log.
const FIRST_ROW_DELAY_MS = 90;
const ROW_STAGGER_MS = 65;

interface AssistantWorkProps {
  readonly item: WorkSessionTimelineItem;
}

export default function AssistantWork(props: AssistantWorkProps) {
  const {item} = props;
  const [expanded, setExpanded] = useState<boolean | undefined>(undefined);

  // Rows present at mount never animate (history, remounts while scrolling);
  // only rows appended while this group is live reveal themselves. A live
  // group that mounts empty animates its header along with its first row.
  const [initialCount] = useState(() => (item.live ? 0 : item.events.length));
  const [revealed, setRevealed] = useState<{batchStart: number; count: number}>({batchStart: initialCount, count: initialCount});
  if (revealed.count !== item.events.length) setRevealed({batchStart: Math.min(revealed.count, item.events.length), count: item.events.length});

  const revealDelayFor = (index: number): number | undefined => {
    if (index < revealed.batchStart) return undefined;
    return (initialCount === 0 && revealed.batchStart === 0 ? FIRST_ROW_DELAY_MS : 0) + (index - revealed.batchStart) * ROW_STAGGER_MS;
  };

  const open = expanded ?? item.live;
  const summary = summarizeWork(item.events);
  const headerAnimates = initialCount === 0;

  const handleToggle = (): void => {
    setExpanded(!open);
  };

  return (
    <section className="flex flex-col">
      <button
        aria-expanded={open}
        className={cn(
          "group/header flex h-7 w-full cursor-pointer items-center gap-1.5 text-left text-sm text-ink-muted transition-colors hover:text-ink motion-reduce:animate-none",
          headerAnimates && "animate-work-reveal [animation-duration:360ms]"
        )}
        onClick={handleToggle}
        type="button"
      >
        <span className="grid w-[22px] shrink-0 place-items-center">
          <Icon className={cn("transition-transform duration-150 ease-out", !open && "-rotate-90")} name="chevron-down" size="xs" />
        </span>
        <span className={cn("min-w-0 truncate", item.live && "shimmer [--shimmer-duration:3.4s]")}>{summary}</span>
      </button>
      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-150 ease-out data-[expanded=true]:grid-rows-[1fr]" data-expanded={open}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col pt-0.5">
            {item.events.map((event, index) => {
              const nextDelay = index + 1 < item.events.length ? revealDelayFor(index + 1) : undefined;
              return (
                <WorkRow
                  continuationDelay={nextDelay}
                  continues={index + 1 < item.events.length}
                  event={event}
                  hasPredecessor={index > 0}
                  key={event.id}
                  revealDelay={revealDelayFor(index)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
