import {useMessageScroller, useMessageScrollerScrollable} from "@shadcn/react/message-scroller";
import {defaultRangeExtractor, elementScroll, useVirtualizer} from "@tanstack/react-virtual";
import type {VirtualItem} from "@tanstack/react-virtual";
import {animate, AnimatePresence, motion, useReducedMotion} from "framer-motion";
import {useLayoutEffect, useRef, useState} from "react";
import type {ReactNode, UIEvent} from "react";
import {Marker, MarkerContent} from "@/components/ui/marker";
import {MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerProvider, MessageScrollerViewport} from "@/components/ui/message-scroller";
import SessionTimelineVirtualRow from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import type {TimelineVirtualItem} from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

// Controls how long a newly sent message takes to move toward the viewport top.
const TIMELINE_ANCHOR_SCROLL_DURATION_MS = 350;
// Leaves a small gap above a newly sent message after it is anchored.
const TIMELINE_ANCHOR_TOP_MARGIN_PX = 24;
// Leaves trailing space after the final virtualized timeline row.
const TIMELINE_BOTTOM_PADDING_PX = 32;
// Bounds retained measurement snapshots used when switching between sessions.
const TIMELINE_CACHE_LIMIT = 16;
// Allows this much bottom-distance error while the initial position settles.
const TIMELINE_END_THRESHOLD_PX = 5;
// Shows the scroll-to-latest button after the user moves this far from the bottom.
const TIMELINE_SCROLL_BUTTON_THRESHOLD_PX = 50;
// Lets streamed rows visually catch up after auto-follow instantly advances scrollTop.
const TIMELINE_STREAM_SCROLL_ANIMATION_MS = 160;
// Caps that catch-up distance when a stream update adds a large amount of content.
const TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX = 56;

const timelineCache = new Map<string, VirtualItem[]>();

function hasLiveTimelineOutput(items: readonly SessionTimelineItem[]): boolean {
  return items.some((item) => {
    if (item.type === "assistant") return item.event.content.trim().length > 0;
    if (item.type === "work") return item.events.length > 0;
    return item.type === "compaction";
  });
}

/** Keeps virtual row identity stable when live event ids change on settlement. */
function buildVirtualRowKeys(rows: readonly TimelineVirtualItem[]): readonly string[] {
  const typeCounts = new Map<string, number>();
  let turnIndex = -1;

  return rows.map((item) => {
    if (!("turnId" in item)) return item.id;
    if (item.type === "user") {
      turnIndex += 1;
      typeCounts.clear();
    }

    const typeIndex = typeCounts.get(item.type) ?? 0;
    typeCounts.set(item.type, typeIndex + 1);
    return `turn:${turnIndex}:${item.type}:${typeIndex}`;
  });
}

function buildTimelineRows(input: {
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly streamError: string | null;
}): readonly TimelineVirtualItem[] {
  const {items, liveItems, streamError} = input;
  const rows: TimelineVirtualItem[] = [{id: "top-spacer", type: "top-spacer"}, ...items, ...liveItems];
  const activeTurnId = liveItems[0]?.turnId ?? items.at(-1)?.turnId ?? "session";

  if (streamError) rows.push({id: `stream-error:${activeTurnId}`, message: streamError, turnId: activeTurnId, type: "stream-error"});

  return rows;
}

interface SessionTimelineProviderProps {
  readonly children: ReactNode;
}

/** Provides shared timeline commands to the conversation and transcript. */
export function SessionTimelineProvider(props: SessionTimelineProviderProps) {
  const {children} = props;

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollEdgeThreshold={0}>
      {children}
    </MessageScrollerProvider>
  );
}

interface SessionTimelineProps {
  readonly bottomOverlayHeight?: number;
  readonly compacting: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly sessionId: string;
  readonly streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {bottomOverlayHeight = 0, compacting, isStreaming, items, liveItems, onRevertToMessage, sessionId, streamError} = props;
  const {scrollToEnd} = useMessageScroller();
  const {end: canScrollToEnd} = useMessageScrollerScrollable();
  const cachedMeasurementsRef = useRef(timelineCache.get(sessionId));
  const viewportRef = useRef<HTMLDivElement>(null);
  const virtualContentRef = useRef<HTMLDivElement>(null);
  const streamContentRef = useRef<HTMLDivElement>(null);
  const anchorSpaceRef = useRef<HTMLDivElement>(null);
  const anchorSpaceHeightRef = useRef(0);
  const realContentHeightRef = useRef<number | null>(null);
  const anchorScrollTargetRef = useRef<number | null>(null);
  const anchorScrollAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const shouldSetInitialPositionRef = useRef(true);
  const streamAnimationReadyRef = useRef(false);
  const streamScrollAnimationRef = useRef<Animation | null>(null);

  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  const timelineRows = hasTimelineContent ? buildTimelineRows({items, liveItems, streamError}) : [];
  const activeTurnId = liveItems[0]?.turnId ?? null;
  const hasLiveOutput = hasLiveTimelineOutput(liveItems);
  if (!hasLiveOutput) streamAnimationReadyRef.current = false;

  const statusLabel = isStreaming ? (compacting ? "Compacting context" : "Thinking") : null;
  const pullStatusIntoLastMessage = hasLiveOutput && liveItems.at(-1)?.spacing === "message";
  const virtualRowKeys = buildVirtualRowKeys(timelineRows);
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const hasLiveUserRow = liveItems[0]?.type === "user";
  const liveUserRowIndex = hasLiveUserRow ? 1 + items.length : -1;
  const previousHasLiveUserRowRef = useRef(hasLiveUserRow);

  const setAnchorSpaceHeight = (height: number): void => {
    anchorSpaceHeightRef.current = height;
    if (anchorSpaceRef.current) anchorSpaceRef.current.style.height = `${height}px`;
  };

  const stopAnchorScroll = (): void => {
    anchorScrollAnimationRef.current?.stop();
    anchorScrollAnimationRef.current = null;
    anchorScrollTargetRef.current = null;
  };

  // Anchor space is lossy: growth and upward scrolling only consume it. When
  // real content shrinks, replace that height to prevent scrollTop clamping.
  const syncAnchorSpace = (viewport: HTMLDivElement): void => {
    const currentHeight = anchorSpaceHeightRef.current;
    const realContentHeight = viewport.scrollHeight - currentHeight;
    const previousRealContentHeight = realContentHeightRef.current ?? realContentHeight;
    realContentHeightRef.current = realContentHeight;
    if (currentHeight === 0) return;

    const anchorScrollTarget = anchorScrollTargetRef.current;
    const shrinkDelta = previousRealContentHeight - realContentHeight;
    if (shrinkDelta > 0) {
      setAnchorSpaceHeight(currentHeight + shrinkDelta);
      if (anchorScrollTarget === null) viewport.scrollTop = Math.min(viewport.scrollTop + shrinkDelta, Math.max(0, viewport.scrollHeight - viewport.clientHeight));
      return;
    }

    const requiredHeight = (anchorScrollTarget ?? viewport.scrollTop) + viewport.clientHeight - realContentHeight;
    const nextHeight = Math.max(0, Math.min(currentHeight, requiredHeight));
    if (nextHeight !== currentHeight) setAnchorSpaceHeight(nextHeight);
  };

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    anchorTo: "end",
    count: timelineRows.length,
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    estimateSize: () => 86,
    followOnAppend: true,
    getItemKey: (index) => virtualRowKeys[index] ?? index,
    getScrollElement: () => viewportRef.current,
    initialMeasurementsCache: cachedMeasurementsRef.current,
    overscan: 3,
    paddingEnd: TIMELINE_BOTTOM_PADDING_PX,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (liveUserRowIndex < 0 || indexes.includes(liveUserRowIndex)) return indexes;
      return [...indexes, liveUserRowIndex].toSorted((left, right) => left - right);
    },
    scrollEndThreshold: 0,
    // TanStack adjusts scrollTop before notifying React about a measured size.
    // Publish the new virtual height first so the browser does not clamp that
    // adjustment against the previous height and visibly correct a frame later.
    scrollToFn: (offset, options, instance) => {
      const viewport = viewportRef.current;
      const virtualContent = virtualContentRef.current;
      const streamContent = streamContentRef.current;
      if (virtualContent) virtualContent.style.height = `${instance.getTotalSize()}px`;
      // While anchor space is active the message stays put: growth consumes
      // the space in place, so stale virtualizer follow targets are ignored.
      if (viewport) syncAnchorSpace(viewport);
      if (anchorSpaceHeightRef.current > 0) return;
      const targetOffset = viewport ? Math.min(offset + (options.adjustments ?? 0), Math.max(0, viewport.scrollHeight - viewport.clientHeight)) : 0;
      const scrollDelta = viewport ? targetOffset - viewport.scrollTop : 0;
      if (
        !shouldReduceMotion &&
        isStreaming &&
        !shouldSetInitialPositionRef.current &&
        streamAnimationReadyRef.current &&
        viewport &&
        !viewport.dataset.scrollable?.includes("end") &&
        scrollDelta > 0 &&
        streamContent
      ) {
        const transform = window.getComputedStyle(streamContent).transform;
        const currentOffset = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
        streamScrollAnimationRef.current?.cancel();
        streamScrollAnimationRef.current = streamContent.animate(
          [{transform: `translateY(${Math.min(Math.max(0, currentOffset) + scrollDelta, TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX)}px)`}, {transform: "translateY(0)"}],
          {duration: TIMELINE_STREAM_SCROLL_ANIMATION_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)"}
        );
      }
      elementScroll(offset, options, instance);
    },
  });

  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => item.end <= instance.getLogicalScrollOffset();

  const virtualItems = virtualizer.getVirtualItems();

  // Anchors a freshly sent message near the viewport top. Space below it makes
  // that position the scroll end and is consumed as the response grows.
  useLayoutEffect(() => {
    const hadLiveUserRow = previousHasLiveUserRowRef.current;
    previousHasLiveUserRowRef.current = hasLiveUserRow;
    if (!hasLiveUserRow || hadLiveUserRow) return;

    // The message paints at the bottom on this frame, so anchoring waits for
    // the next one: the scroll then eases up from where the message appeared.
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const rowElement = viewport?.querySelector<HTMLElement>(`[data-index="${liveUserRowIndex}"]`);
      if (!viewport || !rowElement) return;

      stopAnchorScroll();
      const rowOffset = rowElement.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      const anchorOffset = Math.max(0, rowOffset - TIMELINE_ANCHOR_TOP_MARGIN_PX);
      const realContentHeight = viewport.scrollHeight - anchorSpaceHeightRef.current;
      realContentHeightRef.current = realContentHeight;
      setScrollButtonVisible(false);
      setAnchorSpaceHeight(Math.max(0, anchorOffset + viewport.clientHeight - realContentHeight));

      const anchorScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (anchorScrollTop <= viewport.scrollTop) return;

      anchorScrollTargetRef.current = anchorScrollTop;
      if (shouldReduceMotion) {
        viewport.scrollTop = anchorScrollTop;
        stopAnchorScroll();
        return;
      }

      anchorScrollAnimationRef.current = animate(viewport.scrollTop, anchorScrollTop, {
        duration: TIMELINE_ANCHOR_SCROLL_DURATION_MS / 1_000,
        ease: (progress) => 1 - (1 - progress) ** 3,
        onComplete: () => {
          anchorScrollAnimationRef.current = null;
          anchorScrollTargetRef.current = null;
        },
        onUpdate: (scrollTop) => {
          viewport.scrollTop = scrollTop;
        },
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasLiveUserRow, liveUserRowIndex, shouldReduceMotion]);

  // Consume anchor space before auto-follow can move the viewport.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) syncAnchorSpace(viewport);
  });

  useLayoutEffect(() => {
    // A competing automatic follow scroll must not cut a protected smooth
    // transition short; each transition already ends at the scroll end.
    if (anchorScrollTargetRef.current !== null) return;
    if (!canScrollToEnd) scrollToEnd({behavior: "auto"});
  }, [canScrollToEnd, compacting, isStreaming, items, liveItems, scrollToEnd, streamError]);

  const handleViewportScroll = (event: UIEvent<HTMLDivElement>): void => {
    const viewport = event.currentTarget;
    const isAnchorScrolling = anchorScrollTargetRef.current !== null;
    syncAnchorSpace(viewport);
    setScrollButtonVisible(
      !shouldSetInitialPositionRef.current && !isAnchorScrolling && viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop >= TIMELINE_SCROLL_BUTTON_THRESHOLD_PX
    );
  };

  useLayoutEffect(
    () => () => {
      streamScrollAnimationRef.current?.cancel();
      stopAnchorScroll();
    },
    []
  );

  useLayoutEffect(() => {
    if (!hasLiveOutput) return;

    const frame = window.requestAnimationFrame(() => {
      streamAnimationReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasLiveOutput]);

  useLayoutEffect(() => {
    if (!hasTimelineContent || !shouldSetInitialPositionRef.current) return;

    // Message Scroller applies its default position before TanStack has
    // measured every row entering the bottom range. Keep the viewport hidden
    // while TanStack reconciles those measurements, then reveal it on the
    // first frame that is already anchored to the measured bottom.
    let frame = 0;
    let previousScrollHeight = 0;
    let stableFrameCount = 0;
    const settleAtBottom = (): void => {
      scrollToEnd({behavior: "auto"});
      const currentViewport = viewportRef.current;
      if (!currentViewport) return;

      const bottomDistance = currentViewport.scrollHeight - currentViewport.clientHeight - currentViewport.scrollTop;
      stableFrameCount = bottomDistance <= TIMELINE_END_THRESHOLD_PX && currentViewport.scrollHeight === previousScrollHeight ? stableFrameCount + 1 : 0;
      previousScrollHeight = currentViewport.scrollHeight;
      if (stableFrameCount >= 2) {
        shouldSetInitialPositionRef.current = false;
        currentViewport.style.visibility = "visible";
        return;
      }

      frame = window.requestAnimationFrame(settleAtBottom);
    };

    scrollToEnd({behavior: "auto"});
    frame = window.requestAnimationFrame(settleAtBottom);

    return () => window.cancelAnimationFrame(frame);
  }, [hasTimelineContent, scrollToEnd]);

  useLayoutEffect(
    () => () => {
      if (virtualizer.options.count === 0) return;

      timelineCache.delete(sessionId);
      timelineCache.set(sessionId, virtualizer.takeSnapshot());
      while (timelineCache.size > TIMELINE_CACHE_LIMIT) timelineCache.delete(timelineCache.keys().next().value!);
    },
    [sessionId, virtualizer]
  );

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {!hasTimelineContent && (
        <div className="flex min-h-full items-center justify-center px-5 pb-8 pt-6 md:px-8">
          <p className="text-center text-sm text-ink-faint">No messages yet.</p>
        </div>
      )}
      {hasTimelineContent && (
        <MessageScroller>
          <MessageScrollerViewport
            aria-label="Session timeline"
            className={shouldSetInitialPositionRef.current ? "invisible" : undefined}
            onScroll={handleViewportScroll}
            onTouchMove={stopAnchorScroll}
            onWheel={stopAnchorScroll}
            preserveScrollOnPrepend={false}
            ref={viewportRef}
          >
            <MessageScrollerContent aria-busy={isStreaming} className="block min-h-full">
              <div
                className="relative w-full overflow-clip"
                data-timeline-virtual-content
                ref={(element) => {
                  virtualContentRef.current = element;
                  virtualizer.containerRef(element);
                }}
              >
                <div className="absolute inset-0" data-timeline-stream-content ref={streamContentRef}>
                  {virtualItems.map((virtualItem) => {
                    const item = timelineRows[virtualItem.index];
                    if (!item) return null;

                    return (
                      <div className="absolute inset-s-0 w-full" data-index={virtualItem.index} key={virtualItem.key} ref={virtualizer.measureElement}>
                        <SessionTimelineVirtualRow activeTurnId={activeTurnId} item={item} onRevertToMessage={onRevertToMessage} />
                      </div>
                    );
                  })}
                </div>
              </div>
              {statusLabel && (
                <div
                  className={cn("relative z-10 mx-auto w-full max-w-3xl bg-surface px-5 pb-8 md:px-8", pullStatusIntoLastMessage && "-mt-6")}
                  data-timeline-footer="streaming-status"
                >
                  {compacting ? (
                    <Marker role="status" variant="separator">
                      <MarkerContent className="shimmer text-ink-faint">{statusLabel}</MarkerContent>
                    </Marker>
                  ) : (
                    <p className="shimmer w-fit text-sm text-ink-faint">{statusLabel}</p>
                  )}
                </div>
              )}
              <div aria-hidden="true" className="shrink-0" data-timeline-fake-space ref={anchorSpaceRef} />
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <AnimatePresence>
            {scrollButtonVisible && (
              <motion.div
                animate={{opacity: 1, scale: 1, x: "-50%", y: 0, transition: {duration: 0.2, ease: [0.23, 1, 0.32, 1]}}}
                className="absolute left-1/2 z-10"
                exit={{opacity: 0, x: "-50%", transition: {duration: 0}}}
                initial={{opacity: 0, scale: 0.95, x: "-50%", y: shouldReduceMotion ? 0 : "100%"}}
                style={{bottom: `calc(1rem + ${bottomOverlayHeight}px)`}}
              >
                <MessageScrollerButton behavior="auto" className="static translate-x-0 bg-surface transition-colors hover:bg-surface-popover rtl:translate-x-0" />
              </motion.div>
            )}
          </AnimatePresence>
        </MessageScroller>
      )}
    </div>
  );
}
