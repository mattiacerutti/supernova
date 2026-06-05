import {useVirtualizer} from "@tanstack/react-virtual";
import {useCallback, useState} from "react";
import type {ReactNode, RefObject} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SessionTimelineFooter from "@/features/sessions/components/timeline/session-timeline-footer";
import SessionTimelineItemFrame from "@/features/sessions/components/timeline/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/session-timeline-row";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

const FOOTER_ESTIMATED_SIZE_PX = 96;
const ITEM_ESTIMATED_SIZE_PX = 140;
const SCROLL_END_THRESHOLD_PX = 2;

function isScrollerAtEnd(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= SCROLL_END_THRESHOLD_PX;
}

interface SessionTimelineProps {
  readonly compacting: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly scrollContainerRef: RefObject<HTMLDivElement | null>;
  readonly liveItems: readonly SessionTimelineItem[];
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {compacting, isStreaming, items, scrollContainerRef, liveItems, onRevertToMessage, streamError} = props;

  const [showScrollToEndButton, setShowScrollToEndButton] = useState(false);

  const itemCount = items.length + 1;
  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    anchorTo: "end",
    count: itemCount,
    estimateSize: (index) => (index === items.length ? FOOTER_ESTIMATED_SIZE_PX : ITEM_ESTIMATED_SIZE_PX),
    followOnAppend: "auto",
    getItemKey: (index) => items[index]?.id ?? "session-timeline-footer",
    getScrollElement: () => scrollContainerRef.current,
    initialOffset: () => Number.MAX_SAFE_INTEGER,
    overscan: 6,
    paddingStart: 24,
    scrollEndThreshold: SCROLL_END_THRESHOLD_PX,
  });

  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (_item, _delta, instance) => instance.isAtEnd(SCROLL_END_THRESHOLD_PX);

  const scrollToEnd = useCallback(
    (behavior: ScrollBehavior = "auto"): void => {
      virtualizer.scrollToEnd({behavior});
      setShowScrollToEndButton(false);
    },
    [virtualizer]
  );

  const handleScroll = (): void => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    setShowScrollToEndButton(!isScrollerAtEnd(scroller));
  };

  const renderVirtualItem = (index: number): ReactNode => {
    const item = items[index];
    if (item) {
      return (
        <SessionTimelineItemFrame item={item}>
          <SessionTimelineRow item={item} onRevertToMessage={onRevertToMessage} />
        </SessionTimelineItemFrame>
      );
    }

    return <SessionTimelineFooter compacting={compacting} isStreaming={isStreaming} liveItems={liveItems} streamError={streamError} />;
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {!hasTimelineContent && (
        <div className="flex min-h-full items-center justify-center px-5 pb-8 pt-6 md:px-8">
          <p className="text-center text-sm text-neutral-600">No messages yet.</p>
        </div>
      )}
      {hasTimelineContent && (
        <div className="h-full overflow-x-hidden overflow-y-auto overscroll-y-contain" onScroll={handleScroll} ref={scrollContainerRef}>
          <div className="relative w-full" style={{height: virtualizer.getTotalSize()}}>
            {virtualItems.map((virtualItem) => (
              <div
                className="absolute left-0 top-0 w-full"
                data-index={virtualItem.index}
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                style={{transform: `translateY(${virtualItem.start}px)`}}
              >
                {renderVirtualItem(virtualItem.index)}
              </div>
            ))}
          </div>
        </div>
      )}
      {showScrollToEndButton && (
        <IconButton
          className="absolute bottom-4 left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-[#181818] text-white ring-1 ring-neutral-700 transition hover:bg-[#202020]"
          label="Scroll to latest message"
          onClick={() => scrollToEnd("smooth")}
          size="none"
          variant="bare"
        >
          <Icon name="arrow-down" size="sm" />
        </IconButton>
      )}
    </div>
  );
}
