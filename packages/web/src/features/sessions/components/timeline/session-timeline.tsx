import {defaultRangeExtractor, elementScroll, useVirtualizer} from "@tanstack/react-virtual";
import type {ReactVirtualizer, VirtualItem} from "@tanstack/react-virtual";
import {useLayoutEffect, useRef, useState} from "react";
import SessionTimelineVirtualRow from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import type {TimelineVirtualItem} from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import IconButton from "@/components/ui/icon-button";
import Icon from "@/components/ui/icon";

const TIMELINE_BOTTOM_PADDING_PX = 24;
const TIMELINE_CACHE_LIMIT = 16;
const TIMELINE_FALLBACK_ITEM_SIZE = 60;
const TIMELINE_SCROLL_END_THRESHOLD_PX = 50;

const timelineCache = new Map<string, {measurements: VirtualItem[]; scrollOffset: number}>();

function hasLiveTimelineOutput(items: readonly SessionTimelineItem[]): boolean {
  return items.some((item) => {
    if (item.type === "assistant") return item.event.content.trim().length > 0;
    if (item.type === "work") return item.events.length > 0;
    return item.type === "compaction";
  });
}

function hasPendingToolCall(items: readonly SessionTimelineItem[]): boolean {
  return items.some((item) => item.type === "work" && item.events.some((event) => event.type === "tool" && event.tool?.status === "pending"));
}

function streamingStatusLabel(compacting: boolean): string {
  return compacting ? "Compacting context" : "Thinking";
}

function buildTimelineRows(input: {
  readonly compacting: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly streamError: string | null;
}): readonly TimelineVirtualItem[] {
  const {compacting, isStreaming, items, liveItems, streamError} = input;
  const rows: TimelineVirtualItem[] = [{id: "top-spacer", type: "top-spacer"}, ...items, ...liveItems];
  const activeTurnId = liveItems[0]?.turnId ?? items.at(-1)?.turnId ?? "session";
  const streamingLabel = streamingStatusLabel(compacting);

  if (isStreaming && !hasLiveTimelineOutput(liveItems) && !hasPendingToolCall(liveItems)) {
    rows.push({id: `streaming-status:${activeTurnId}`, label: streamingLabel, turnId: activeTurnId, type: "streaming-status"});
  }

  if (streamError) rows.push({id: `stream-error:${activeTurnId}`, message: streamError, turnId: activeTurnId, type: "stream-error"});

  return rows;
}

function turnFingerprint(rows: readonly TimelineVirtualItem[], turnId: string): string | null {
  for (const item of rows) {
    if (item.type === "user" && item.turnId === turnId) return JSON.stringify(item.message.contentParts);
  }

  return null;
}

interface VirtualTimelineRowProps {
  readonly activeTurnId: string | null;
  readonly inlineStatusLabel?: string;
  readonly item: TimelineVirtualItem;
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly virtualItem: VirtualItem;
  readonly virtualizer: ReactVirtualizer<HTMLDivElement, HTMLDivElement>;
}

function VirtualTimelineRow(props: VirtualTimelineRowProps) {
  const {activeTurnId, inlineStatusLabel, item, onRevertToMessage, virtualItem, virtualizer} = props;
  const measuredElementRef = useRef<HTMLDivElement | null>(null);

  const setMeasuredElement = (element: HTMLDivElement | null): void => {
    measuredElementRef.current = element;
    if (element) virtualizer.measureElement(element);
  };

  useLayoutEffect(() => {
    const element = measuredElementRef.current;
    if (!element) return;
    virtualizer.measureElement(element);
  }, [inlineStatusLabel, item.id, virtualizer]);

  return (
    <div
      data-index={virtualItem.index}
      data-timeline-key={String(virtualItem.key)}
      ref={setMeasuredElement}
      style={{
        left: 0,
        overflow: inlineStatusLabel ? "visible" : "clip",
        position: "absolute",
        width: "100%",
      }}
    >
      <SessionTimelineVirtualRow activeTurnId={activeTurnId} inlineStatusLabel={inlineStatusLabel} item={item} onRevertToMessage={onRevertToMessage} />
    </div>
  );
}

interface SessionTimelineProps {
  readonly compacting: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly sessionId: string;
  readonly streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {compacting, isStreaming, items, liveItems, onRevertToMessage, sessionId, streamError} = props;

  const [scrollToEndButton, setShowScrollToEndButton] = useState(false);

  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  const timelineRows = hasTimelineContent ? buildTimelineRows({compacting, isStreaming, items, liveItems, streamError}) : [];
  const activeTurnId = liveItems[0]?.turnId ?? null;
  const activeRowIndex = activeTurnId ? timelineRows.findLastIndex((item) => "turnId" in item && item.turnId === activeTurnId) : -1;
  const inlineStatusItemId = isStreaming && hasLiveTimelineOutput(liveItems) && !hasPendingToolCall(liveItems) ? liveItems.at(-1)?.id : undefined;
  const inlineStatusLabel = inlineStatusItemId ? streamingStatusLabel(compacting) : undefined;
  const visibleTurnCount = new Set([...items.map((item) => item.turnId), ...liveItems.map((item) => item.turnId)]).size;

  const cachedRef = useRef(timelineCache.get(sessionId));
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const virtualContentRef = useRef<HTMLDivElement | null>(null);

  const initialBottomSettleFrameRef = useRef<number | null>(null);
  const shouldSettleInitialBottomRef = useRef(cachedRef.current === undefined);
  const isAtEndRef = useRef(cachedRef.current === undefined);

  const latestRowsLengthRef = useRef(timelineRows.length);
  const latestRowsRef = useRef(timelineRows);
  const latestSessionIdRef = useRef(sessionId);
  const previousVisibleTurnCountRef = useRef(visibleTurnCount);
  const activeTurnKeyPrefixRef = useRef<string | null>(null);
  const activeTurnKeySequenceRef = useRef(0);
  const hadActiveTurnRef = useRef(false);
  const latestActiveTurnFingerprintRef = useRef<string | null>(null);

  latestRowsLengthRef.current = timelineRows.length;
  latestRowsRef.current = timelineRows;
  latestSessionIdRef.current = sessionId;

  const activeTurnFingerprint = activeTurnId ? turnFingerprint(timelineRows, activeTurnId) : null;
  const lastCommittedTurnId = items.at(-1)?.turnId ?? null;
  const lastCommittedFingerprint = lastCommittedTurnId ? turnFingerprint(timelineRows, lastCommittedTurnId) : null;
  let stableKeyTurnId: string | null = null;
  let stableKeyPrefix: string | null = null;

  if (activeTurnId && activeTurnFingerprint) {
    if (!hadActiveTurnRef.current) {
      activeTurnKeySequenceRef.current += 1;
      activeTurnKeyPrefixRef.current = `active-turn:${activeTurnKeySequenceRef.current}`;
    }

    latestActiveTurnFingerprintRef.current = activeTurnFingerprint;
    stableKeyTurnId = activeTurnId;
    stableKeyPrefix = activeTurnKeyPrefixRef.current;
  } else if (lastCommittedTurnId && lastCommittedFingerprint === latestActiveTurnFingerprintRef.current) {
    stableKeyTurnId = lastCommittedTurnId;
    stableKeyPrefix = activeTurnKeyPrefixRef.current;
  } else {
    activeTurnKeyPrefixRef.current = null;
    latestActiveTurnFingerprintRef.current = null;
  }
  hadActiveTurnRef.current = Boolean(activeTurnId);

  const stableKeySlots = new Map<number, number>();
  if (stableKeyTurnId) {
    let slot = 0;
    for (const [index, item] of timelineRows.entries()) {
      if ("turnId" in item && item.turnId === stableKeyTurnId) {
        stableKeySlots.set(index, slot);
        slot += 1;
      }
    }
  }

  const virtualRowKeys = timelineRows.map((item, index) => {
    const slot = stableKeySlots.get(index);
    return slot === undefined || !stableKeyPrefix ? item.id : `${stableKeyPrefix}:${slot}`;
  });
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    anchorTo: "end",
    count: timelineRows.length,
    // Keep scroll compensation and row positioning in the same frame. Without
    // this, first-time measurements in huge sessions can flash because scrollTop
    // updates before React commits the new virtual row positions.
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    estimateSize: () => TIMELINE_FALLBACK_ITEM_SIZE,
    followOnAppend: true,
    getItemKey: (index) => virtualRowKeys[index] ?? `removed:${index}`,
    getScrollElement: () => scrollRootRef.current,
    initialMeasurementsCache: cachedRef.current?.measurements,
    initialOffset: () => cachedRef.current?.scrollOffset ?? Number.MAX_SAFE_INTEGER,
    overscan: 5,
    paddingEnd: TIMELINE_BOTTOM_PADDING_PX,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (activeRowIndex < 0) return indexes;
      return Array.from(new Set([...indexes, activeRowIndex])).toSorted((a, b) => a - b);
    },
    scrollEndThreshold: 5,
    scrollToFn: (offset, options, instance) => {
      if (virtualContentRef.current) virtualContentRef.current.style.height = `${instance.getTotalSize()}px`;
      elementScroll(offset, options, instance);
    },
  });

  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => item.end <= instance.getLogicalScrollOffset();

  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    if (!hasTimelineContent) return;

    const scroller = scrollRootRef.current;
    if (!scroller) return;

    const readIsAtEnd = (): boolean => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= TIMELINE_SCROLL_END_THRESHOLD_PX;

    isAtEndRef.current = readIsAtEnd();
    const observer = new ResizeObserver(() => {
      if (!isAtEndRef.current) return;

      scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight;
      const isAtEnd = readIsAtEnd();
      isAtEndRef.current = isAtEnd;
      setShowScrollToEndButton(!isAtEnd);
    });
    observer.observe(scroller);

    return () => observer.disconnect();
  }, [hasTimelineContent]);

  useLayoutEffect(() => {
    if (!hasTimelineContent || !shouldSettleInitialBottomRef.current) return;

    // First uncached mounts start at the estimated bottom, then bottom rows get
    // their real sizes. The synchronous call corrects the pre-paint commit after
    // ref measurements; the RAF pass catches late ResizeObserver/direct-DOM size
    // updates without showing the estimated-bottom frame.
    isAtEndRef.current = true;
    virtualizer.scrollToEnd();
    initialBottomSettleFrameRef.current = window.requestAnimationFrame(() => {
      initialBottomSettleFrameRef.current = null;
      shouldSettleInitialBottomRef.current = false;
      isAtEndRef.current = true;
      virtualizer.scrollToEnd();
    });

    return () => {
      if (initialBottomSettleFrameRef.current !== null) window.cancelAnimationFrame(initialBottomSettleFrameRef.current);
    };
  }, [hasTimelineContent, timelineRows.length, virtualizer]);

  useLayoutEffect(() => {
    const previousVisibleTurnCount = previousVisibleTurnCountRef.current;
    previousVisibleTurnCountRef.current = visibleTurnCount;
    if (visibleTurnCount === previousVisibleTurnCount) return;

    virtualizer.scrollToEnd();
  }, [visibleTurnCount, virtualizer]);

  useLayoutEffect(
    () => () => {
      if (latestRowsLengthRef.current > 0) {
        const root = scrollRootRef.current;
        // Active streams use temporary stable virtual keys to avoid live→settled
        // jumps. Persist canonical row ids in the cache so a later remount can
        // reuse the measurements after those temporary keys are gone.
        const measurements = virtualizer.takeSnapshot().map((measurement) => ({
          ...measurement,
          key: latestRowsRef.current[measurement.index]?.id ?? measurement.key,
        }));
        const scrollOffset = root?.scrollTop ?? virtualizer.scrollOffset ?? 0;
        timelineCache.delete(latestSessionIdRef.current);
        timelineCache.set(latestSessionIdRef.current, {measurements, scrollOffset});
        while (timelineCache.size > TIMELINE_CACHE_LIMIT) timelineCache.delete(timelineCache.keys().next().value!);
      }
    },
    [virtualizer]
  );

  const handleScroll = (): void => {
    const scroller = scrollRootRef.current;
    if (!scroller) return;

    if (shouldSettleInitialBottomRef.current) {
      isAtEndRef.current = true;
      setShowScrollToEndButton(false);
      return;
    }

    const bottomDistance = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    const isAtEnd = bottomDistance <= TIMELINE_SCROLL_END_THRESHOLD_PX;
    isAtEndRef.current = isAtEnd;

    setShowScrollToEndButton(!isAtEnd);
  };

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {!hasTimelineContent && (
        <div className="flex min-h-full items-center justify-center px-5 pb-8 pt-6 md:px-8">
          <p className="text-center text-sm text-neutral-600">No messages yet.</p>
        </div>
      )}
      {hasTimelineContent && (
        <div aria-label="Session timeline" className="h-full overflow-x-hidden overflow-y-auto overscroll-y-contain" ref={scrollRootRef} onScroll={handleScroll}>
          <div
            data-timeline-virtual-content
            ref={(element) => {
              virtualContentRef.current = element;
              virtualizer.containerRef(element);
            }}
            style={{
              position: "relative",
              width: "100%",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const item = timelineRows[virtualItem.index];
              if (!item) return null;

              return (
                <VirtualTimelineRow
                  activeTurnId={activeTurnId}
                  inlineStatusLabel={item.id === inlineStatusItemId ? inlineStatusLabel : undefined}
                  item={item}
                  key={virtualItem.key}
                  onRevertToMessage={onRevertToMessage}
                  virtualItem={virtualItem}
                  virtualizer={virtualizer}
                />
              );
            })}
          </div>
        </div>
      )}
      {scrollToEndButton && (
        <IconButton
          className="absolute bottom-4 left-1/2 z-30 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-[#181818] text-white ring-1 ring-neutral-700 transition hover:bg-[#202020]"
          label="Scroll to latest message"
          onClick={() => virtualizer.scrollToEnd()}
          size="none"
          variant="bare"
        >
          <Icon name="arrow-down" size="sm" />
        </IconButton>
      )}
    </div>
  );
}
