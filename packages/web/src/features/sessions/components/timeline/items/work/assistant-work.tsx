import {useState} from "react";
import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import RollingText from "@/components/ui/rolling-text";
import WorkRow from "@/features/sessions/components/timeline/items/work/work-row";
import VirtualWorkList from "@/features/sessions/components/timeline/items/work/virtual-work-list";
import WorkExpansionBody from "@/features/sessions/components/timeline/items/work/work-expansion-body";
import {useWorkExpansion} from "@/features/sessions/hooks/use-work-expansion";
import {summarizeWork} from "@/features/sessions/lib/timeline/work/work-summary";
import type {WorkSessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

/** The first row waits for the header; later rows in a batch stagger so a burst reads as a log. */
const FIRST_ROW_DELAY_MS = 90;
const ROW_STAGGER_MS = 65;

interface WorkRowsProps {
  readonly item: WorkSessionTimelineItem;
  readonly renderRow: (index: number) => ReactNode;
}

function WorkRows(props: WorkRowsProps) {
  const {item, renderRow} = props;
  // Keep the live DOM through automatic closure; the next historical opening can virtualize it.
  const [liveAtMount] = useState(item.live);
  return liveAtMount ? (
    item.events.map((_, index) => renderRow(index))
  ) : (
    <VirtualWorkList count={item.events.length} estimateSize={() => 32} getKey={(index) => item.events[index]!.id} id={item.id} renderRow={renderRow} />
  );
}

interface AssistantWorkProps {
  readonly item: WorkSessionTimelineItem;
}

export default function AssistantWork(props: AssistantWorkProps) {
  const {item} = props;
  const {expanded: open, toggle} = useWorkExpansion(item.id, item.live);

  const [initialCount] = useState(() => (item.live ? 0 : item.events.length));
  const [revealed, setRevealed] = useState<{batchStart: number; count: number}>({batchStart: initialCount, count: initialCount});
  if (revealed.count !== item.events.length) setRevealed({batchStart: Math.min(revealed.count, item.events.length), count: item.events.length});

  const revealDelayFor = (index: number): number | undefined => {
    if (!item.live || index < revealed.batchStart) return undefined;
    return (initialCount === 0 && revealed.batchStart === 0 ? FIRST_ROW_DELAY_MS : 0) + (index - revealed.batchStart) * ROW_STAGGER_MS;
  };

  const handleToggle = (): void => {
    if (!open) setRevealed({batchStart: item.events.length, count: item.events.length});
    toggle();
  };

  const summary = summarizeWork(item.events);
  const headerAnimates = initialCount === 0;

  const renderRow = (index: number) => (
    <WorkRow
      continuationDelay={index + 1 < item.events.length ? revealDelayFor(index + 1) : undefined}
      continues={index + 1 < item.events.length}
      event={item.events[index]!}
      hasPredecessor={index > 0}
      key={item.events[index]!.id}
      revealDelay={revealDelayFor(index)}
    />
  );

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
        <RollingText className="[--shimmer-duration:3.4s]" shimmer={item.live}>
          {summary}
        </RollingText>
      </button>
      <WorkExpansionBody expanded={open}>
        <WorkRows item={item} renderRow={renderRow} />
      </WorkExpansionBody>
    </section>
  );
}
