import {useMessageScroller, useMessageScrollerScrollable} from "@shadcn/react/message-scroller";
import type {SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import {defaultRangeExtractor, elementScroll, observeElementOffset, useVirtualizer} from "@tanstack/react-virtual";
import type {VirtualItem} from "@tanstack/react-virtual";
import {useReducedMotion} from "framer-motion";
import {useCallback, useLayoutEffect, useMemo, useRef, useState} from "react";
import type {KeyboardEvent, PointerEvent, UIEvent} from "react";
import {MessageScroller, MessageScrollerContent, MessageScrollerProvider, MessageScrollerViewport} from "@/features/sessions/components/timeline/viewport/message-scroller";
import EarlierHistoryStatus from "@/features/sessions/components/timeline/viewport/earlier-history-status";
import ScrollToEndButton from "@/features/sessions/components/timeline/viewport/scroll-to-end-button";
import SessionTimelineVirtualRow from "@/features/sessions/components/timeline/rows/session-timeline-virtual-row";
import StreamingStatus from "@/features/sessions/components/timeline/viewport/streaming-status";
import TimelineEmptyState from "@/features/sessions/components/timeline/viewport/timeline-empty-state";
import {WorkExpansionContext, useWorkExpansionState} from "@/features/sessions/hooks/use-work-expansion";
import {buildTimelineRowKeys, buildTimelineRows, hasLiveTimelineOutput, withForkDivider} from "@/features/sessions/lib/timeline/rows/timeline-rows";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

const TIMELINE_TOP_PADDING_PX = 24;
const TIMELINE_BOTTOM_PADDING_PX = 16;
const TIMELINE_EARLIER_HISTORY_HEIGHT_PX = 48;
const TIMELINE_CACHE_LIMIT = 16;
const TIMELINE_SCROLL_BUTTON_THRESHOLD_PX = 50;
const TIMELINE_STREAM_SCROLL_ANIMATION_MS = 160;
const TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX = 56;
const TIMELINE_SEND_SLIDE_DURATION_MS = 320;
const TIMELINE_SEND_BUBBLE_DURATION_MS = 380;

const timelineCache = new Map<string, VirtualItem[]>();

/** Transform-only, so it runs on the compositor and never triggers layout while streaming. */
function animateCatchUp(element: HTMLElement, offset: number, current: Animation | null, maxOffset = TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX): Animation {
  const transform = window.getComputedStyle(element).transform;
  const inFlight = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
  const start = Math.sign(offset) * Math.min(Math.abs(inFlight + offset), maxOffset);
  current?.cancel();
  return element.animate([{transform: `translateY(${start}px)`}, {transform: "translateY(0)"}], {
    duration: TIMELINE_STREAM_SCROLL_ANIMATION_MS,
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  });
}

interface TimelineEarlierHistory {
  readonly count: number;
  readonly failed: boolean;
  readonly load: () => void;
  readonly retry: () => void;
}

interface SessionTimelineProps {
  readonly bottomOverlayHeight?: number;
  readonly earlierHistory: TimelineEarlierHistory;
  readonly compacting: boolean;
  readonly lastCopiedTurnId?: string;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly onForkFromTurn?: (turnId: string) => void;
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly sessionId: string;
  readonly setupStep?: SessionSetupStep | null;
  readonly streamError: string | null;
}

interface SessionTimelineViewportProps extends SessionTimelineProps {
  readonly autoFollowPausedByExpansion: boolean;
  readonly onResumeAutoFollow: () => void;
}

function SessionTimelineViewport(props: SessionTimelineViewportProps) {
  const {
    bottomOverlayHeight = 0,
    compacting,
    autoFollowPausedByExpansion,
    onResumeAutoFollow,
    earlierHistory,
    isStreaming,
    items,
    lastCopiedTurnId,
    liveItems,
    onForkFromTurn,
    onRevertToMessage,
    sessionId,
    setupStep,
    streamError,
  } = props;
  const {scrollToEnd} = useMessageScroller();
  const {end: canScrollToEnd} = useMessageScrollerScrollable();
  const viewportRef = useRef<HTMLDivElement>(null);
  const virtualContentRef = useRef<HTMLDivElement>(null);
  const scrollOffsetChangedRef = useRef<((offset: number, isScrolling: boolean) => void) | null>(null);
  const streamContentRef = useRef<HTMLDivElement>(null);
  const sendContentRef = useRef<HTMLDivElement>(null);
  const sendSlideRef = useRef<Animation | null>(null);
  const streamAnimationReadyRef = useRef(false);
  const streamScrollAnimationRef = useRef<Animation | null>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const footerAnimationRef = useRef<Animation | null>(null);

  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  // The divider sits among the committed rows, so their keys and indexes stay one memoized run.
  const committedRows = useMemo(() => withForkDivider(items, lastCopiedTurnId), [items, lastCopiedTurnId]);
  const timelineRows = hasTimelineContent ? buildTimelineRows({items: committedRows, liveItems, streamError}) : [];
  const activeTurnId = liveItems[0]?.turnId ?? null;
  const hasLiveOutput = hasLiveTimelineOutput(liveItems);
  if (!hasLiveOutput) streamAnimationReadyRef.current = false;

  const pullStatusIntoLastMessage = hasLiveOutput && liveItems.at(-1)?.spacing === "message";
  // Not compiled (TanStack Virtual), so the history's share is memoized by hand: these walk every loaded row, and the
  // timeline renders on every streamed frame and scroll range change. A stable `getItemKey` also spares TanStack
  // from re-measuring every row on each render.
  const committedRowKeys = useMemo(() => buildTimelineRowKeys(committedRows, earlierHistory.count), [committedRows, earlierHistory.count]);
  const committedTurnStarts = useMemo(() => items.filter((item) => item.type === "user").length, [items]);
  // Live rows open a new turn, so their keys continue from the history's turn count.
  const tailRowKeySignature = buildTimelineRowKeys(timelineRows.slice(committedRowKeys.length), earlierHistory.count + committedTurnStarts).join(" ");
  const tailRowKeys = useMemo(() => (tailRowKeySignature ? tailRowKeySignature.split(" ") : []), [tailRowKeySignature]);
  const getItemKey = useCallback((index: number) => committedRowKeys[index] ?? tailRowKeys[index - committedRowKeys.length] ?? index, [committedRowKeys, tailRowKeys]);
  const hasEarlierHistory = earlierHistory.count > 0;
  // The status sits in the canvas's top padding rather than in a row, so loaded turns go in below it.
  const paddingStart = TIMELINE_TOP_PADDING_PX + (hasEarlierHistory ? TIMELINE_EARLIER_HISTORY_HEIGHT_PX : 0);
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const hasLiveUserRow = liveItems[0]?.type === "user";
  const liveUserRowIndex = hasLiveUserRow ? committedRows.length : -1;
  const previousHasLiveUserRowRef = useRef(hasLiveUserRow);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: timelineRows.length,
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    estimateSize: () => 86,
    onChange: (instance, scrolling) => {
      // Direct DOM updates position only the new virtual range. Rows awaiting React's unmount still paint,
      // so keep those mounted rows in the same coordinate system after a measurement shifts the range.
      for (const [key, element] of instance.elementsCache) {
        const item = instance.measurementsCache[instance.indexFromElement(element)];
        if (item?.key !== key) continue;
        const top = `${item.start}px`;
        if (element.style.top !== top) element.style.top = top;
      }
      if (!scrolling) syncViewport();
    },
    getItemKey,
    getScrollElement: () => viewportRef.current,
    initialMeasurementsCache: timelineCache.get(sessionId),
    observeElementOffset: (instance, onOffsetChange) => {
      scrollOffsetChangedRef.current = onOffsetChange;
      return observeElementOffset(instance, onOffsetChange);
    },
    overscan: 3,
    paddingEnd: TIMELINE_BOTTOM_PADDING_PX,
    paddingStart,
    // Mount a sent prompt before the send scrolls to it, so its bubble can animate in.
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (liveUserRowIndex < 0 || indexes.includes(liveUserRowIndex)) return indexes;
      return [...indexes, liveUserRowIndex].toSorted((left, right) => left - right);
    },
    // Publish the new height before TanStack adjusts scrollTop, or the browser clamps against the old height.
    scrollToFn: (offset, options, instance) => {
      const virtualContent = virtualContentRef.current;
      if (virtualContent) virtualContent.style.height = `${instance.getTotalSize()}px`;
      elementScroll(offset, options, instance);
      // A size correction must update the virtual range before paint, not wait for the next native scroll event.
      // Going through the offset observer also consumes TanStack's accumulated size adjustments.
      if (options.adjustments !== undefined && viewportRef.current) scrollOffsetChangedRef.current?.(viewportRef.current.scrollTop, false);
    },
  });

  const stopSendSlide = (): void => {
    const slide = sendSlideRef.current;
    sendSlideRef.current = null;
    const viewport = viewportRef.current;
    const content = sendContentRef.current;
    if (!slide) return;
    // Hand user gestures the painted position, not the destination hidden behind the transform.
    const transform = content ? window.getComputedStyle(content).transform : "none";
    const offset = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
    slide.cancel();
    if (viewport && offset !== 0) viewport.scrollTop -= offset;
  };

  // Measured against the previous commit, not the virtualizer's scroll delta: auto-follow may already have scrolled.
  const streamEndRef = useRef<{footerTop: number; scrollTop: number} | null>(null);
  const measureStreamEnd = (): void => {
    const viewport = viewportRef.current;
    streamEndRef.current = viewport ? {footerTop: (footerRef.current?.offsetTop ?? 0) - viewport.scrollTop, scrollTop: viewport.scrollTop} : null;
  };
  const easeStreamGrowth = (): void => {
    const previous = streamEndRef.current;
    measureStreamEnd();
    const viewport = viewportRef.current;
    const current = streamEndRef.current;
    if (!previous || !current || !viewport || shouldReduceMotion || !isStreaming || !streamAnimationReadyRef.current || sendSlideRef.current !== null) return;

    const footer = footerRef.current;
    const footerShift = current.footerTop - previous.footerTop;
    if (footer && footerShift > 0) footerAnimationRef.current = animateCatchUp(footer, -footerShift, footerAnimationRef.current, Number.POSITIVE_INFINITY);

    const scrolled = current.scrollTop - previous.scrollTop;
    const atEnd = viewport.scrollHeight - viewport.clientHeight - current.scrollTop <= 1;
    if (streamContentRef.current && atEnd && scrolled > 0 && scrolled <= TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX * 4) {
      streamScrollAnimationRef.current = animateCatchUp(streamContentRef.current, scrolled, streamScrollAnimationRef.current);
    }
  };

  const syncViewport = (): void => {
    if (!viewportRef.current) return;
    if (!autoFollowPausedByExpansion && !canScrollToEnd) scrollToEnd({behavior: "auto"});
    easeStreamGrowth();
  };

  // When the rows change (settlement, loaded history, undo), the first row on screen that survives keeps its place.
  // Following the end owns the scroll position instead.
  const renderedItemKeyRef = useRef(getItemKey);
  const readingAnchorRef = useRef<{readonly index: number; readonly offset: number} | null>(null);
  const findReadingAnchor = (): {readonly index: number; readonly offset: number} | null => {
    const viewport = viewportRef.current;
    if (!viewport || (!autoFollowPausedByExpansion && !canScrollToEnd)) return null;
    const indexes = new Map<unknown, number>(Array.from({length: timelineRows.length}, (_, index) => [getItemKey(index), index]));
    // The rows' DOM still shows the previous rows here, which is what the reader sees.
    const surviving = [...virtualizer.elementsCache].flatMap(([key, element]) => {
      const index = indexes.get(key);
      if (index === undefined || !element.isConnected) return [];
      const top = Number.parseFloat(element.style.top);
      return [{index, top, bottom: top + element.offsetHeight}];
    });
    const scrollTop = viewport.scrollTop;
    const ordered = surviving.toSorted((left, right) => left.top - right.top);
    const onScreen = ordered.find((candidate) => candidate.bottom > scrollTop && candidate.top < scrollTop + viewport.clientHeight);
    if (onScreen) return {index: onScreen.index, offset: scrollTop - onScreen.top};
    // Everything on screen was folded away: land on what replaced it, the row after the last survivor above.
    const above = ordered.findLast((candidate) => candidate.bottom <= scrollTop);
    const replacement = above ? above.index + 1 : 0;
    if (replacement < timelineRows.length) return {index: replacement, offset: -TIMELINE_TOP_PADDING_PX};
    return above ? {index: above.index, offset: scrollTop - above.top} : null;
  };
  virtualizer.getTotalSize();
  if (getItemKey !== renderedItemKeyRef.current) {
    const anchor = findReadingAnchor();
    readingAnchorRef.current = anchor;
    const start = anchor ? virtualizer.measurementsCache[anchor.index]?.start : undefined;
    // Render the range at the anchor's new place now, not a frame late; the layout effect corrects unmeasured estimates.
    if (anchor && start !== undefined) virtualizer.scrollOffset = start + anchor.offset;
  }

  // DOM offset, not TanStack's, which lags to the next scroll event. A pending reading anchor does its own correction.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => readingAnchorRef.current === null && item.end <= (viewportRef.current?.scrollTop ?? 0);

  const virtualItems = virtualizer.getVirtualItems();

  const loadEarlierNearTop = (viewport: HTMLDivElement): void => {
    if (hasEarlierHistory && viewport.scrollTop < viewport.clientHeight) earlierHistory.load();
  };

  // Sending keeps the reader's position. Following at the end, the new message is revealed there: its bubble rises in
  // from the composer while the transcript slides up by the distance the send scrolled it.
  useLayoutEffect(() => {
    const hadLiveUserRow = previousHasLiveUserRowRef.current;
    previousHasLiveUserRowRef.current = hasLiveUserRow;
    if (!hasLiveUserRow || hadLiveUserRow) return;

    const viewport = viewportRef.current;
    const content = sendContentRef.current;
    if (!viewport || !content) return;

    const following = !canScrollToEnd;
    stopSendSlide();
    if (following) {
      onResumeAutoFollow();
      // The send claims the end; a reading anchor taken for its new row would scroll back.
      readingAnchorRef.current = null;
      streamScrollAnimationRef.current?.cancel();
    }
    const scrollTopBeforeSend = viewport.scrollTop;
    if (following) {
      scrollToEnd({behavior: "auto"});
      setScrollButtonVisible(false);
    }
    if (shouldReduceMotion) return;

    const scrolled = Math.min(viewport.scrollTop - scrollTopBeforeSend, viewport.clientHeight);
    if (scrolled > 0) {
      const slide = content.animate([{transform: `translateY(${scrolled}px)`}, {transform: "translateY(0)"}], {
        duration: TIMELINE_SEND_SLIDE_DURATION_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
      sendSlideRef.current = slide;
      slide.onfinish = () => {
        if (sendSlideRef.current === slide) sendSlideRef.current = null;
      };
    }
    viewport.querySelector(`[data-index="${liveUserRowIndex}"] article`)?.animate(
      [
        {transform: "translateY(24px) scale(0.82)", transformOrigin: "100% 100%", opacity: 0.6},
        {transform: "none", transformOrigin: "100% 100%", opacity: 1},
      ],
      {duration: TIMELINE_SEND_BUBBLE_DURATION_MS, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)"}
    );
  }, [canScrollToEnd, hasLiveUserRow, liveUserRowIndex, onResumeAutoFollow, scrollToEnd, shouldReduceMotion]);

  useLayoutEffect(() => {
    renderedItemKeyRef.current = getItemKey;
    const viewport = viewportRef.current;
    const anchor = readingAnchorRef.current;
    if (viewport && anchor) {
      // During user scrolling TanStack leaves new rows to its ResizeObserver; the anchor needs their heights now.
      const unmeasured = virtualItems.flatMap((item) => {
        const element = virtualizer.elementsCache.get(item.key);
        return element && !virtualizer.itemSizeCache.has(item.key) ? [{index: item.index, height: element.offsetHeight}] : [];
      });
      for (const {index, height} of unmeasured) virtualizer.resizeItem(index, height);
      const start = virtualizer.measurementsCache[anchor.index]?.start;
      if (start !== undefined) {
        // Publish the new height first, or the browser clamps against the old one.
        if (virtualContentRef.current) virtualContentRef.current.style.height = `${virtualizer.getTotalSize()}px`;
        viewport.scrollTop = start + anchor.offset;
        scrollOffsetChangedRef.current?.(viewport.scrollTop, false);
      }
    }
    readingAnchorRef.current = null;
    if (!viewport) return;
    // Without enough content to scroll, no scroll event would ever ask for more.
    if (viewport.scrollHeight - viewport.clientHeight < viewport.clientHeight) loadEarlierNearTop(viewport);
  });

  useLayoutEffect(syncViewport);

  // Virtualized rows have no per-turn ancestor, so each row of the hovered group is flagged. A turn's user
  // message is its own group; otherwise hovering it would reveal the assistant's actions, and vice versa.
  const setHoveredTurn = (viewport: HTMLDivElement, hoverGroup: string | undefined): void => {
    for (const row of viewport.querySelectorAll<HTMLElement>("[data-hover-group]"))
      row.classList.toggle("turn-hover", hoverGroup !== undefined && row.dataset.hoverGroup === hoverGroup);
  };

  const handleViewportPointerOver = (event: PointerEvent<HTMLDivElement>): void => {
    setHoveredTurn(event.currentTarget, (event.target as HTMLElement).closest<HTMLElement>("[data-hover-group]")?.dataset.hoverGroup);
  };

  const handleViewportPointerLeave = (event: PointerEvent<HTMLDivElement>): void => {
    setHoveredTurn(event.currentTarget, undefined);
  };

  const handleViewportKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || target.isContentEditable || target.closest("input, textarea, select")) return;
    if (event.key === " " && target.closest("button")) return;
    // Message Scroller cancels its own scrolling on these keys, not our animation.
    if (["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", " "].includes(event.key)) {
      stopSendSlide();
      onResumeAutoFollow();
    }
  };

  const handleViewportScroll = (event: UIEvent<HTMLDivElement>): void => {
    const viewport = event.currentTarget;
    measureStreamEnd();
    loadEarlierNearTop(viewport);
    setScrollButtonVisible(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop >= TIMELINE_SCROLL_BUTTON_THRESHOLD_PX);
  };

  useLayoutEffect(() => {
    if (!hasLiveOutput) return;

    const frame = window.requestAnimationFrame(() => {
      streamAnimationReadyRef.current = true;
      measureStreamEnd();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasLiveOutput]);

  useLayoutEffect(
    () => () => {
      streamScrollAnimationRef.current?.cancel();
      footerAnimationRef.current?.cancel();
      stopSendSlide();
      if (virtualizer.options.count === 0) return;

      timelineCache.delete(sessionId);
      timelineCache.set(sessionId, virtualizer.takeSnapshot());
      while (timelineCache.size > TIMELINE_CACHE_LIMIT) timelineCache.delete(timelineCache.keys().next().value!);
    },
    [sessionId, virtualizer]
  );

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {hasTimelineContent ? (
        <MessageScroller>
          <MessageScrollerViewport
            aria-label="Session timeline"
            onKeyDown={handleViewportKeyDown}
            onPointerLeave={handleViewportPointerLeave}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onResumeAutoFollow();
            }}
            onPointerOver={handleViewportPointerOver}
            onScroll={handleViewportScroll}
            onTouchMove={() => {
              stopSendSlide();
              onResumeAutoFollow();
            }}
            onWheel={() => {
              stopSendSlide();
              onResumeAutoFollow();
            }}
            ref={viewportRef}
          >
            <MessageScrollerContent aria-busy={isStreaming} className="block min-h-full overflow-clip">
              <div ref={sendContentRef}>
                <div
                  className="relative w-full overflow-clip"
                  data-timeline-virtual-content
                  ref={(element) => {
                    virtualContentRef.current = element;
                    virtualizer.containerRef(element);
                  }}
                >
                  {hasEarlierHistory && (
                    <EarlierHistoryStatus failed={earlierHistory.failed} height={TIMELINE_EARLIER_HISTORY_HEIGHT_PX} onRetry={earlierHistory.retry} top={TIMELINE_TOP_PADDING_PX} />
                  )}
                  <div className="absolute inset-0" data-timeline-stream-content ref={streamContentRef}>
                    {virtualItems.map((virtualItem) => {
                      const item = timelineRows[virtualItem.index];
                      if (!item) return null;

                      return (
                        <div
                          className="group/turn absolute inset-s-0 w-full"
                          data-index={virtualItem.index}
                          data-hover-group={item.type === "user" ? `user:${item.turnId}` : item.turnId}
                          key={virtualItem.key}
                          ref={virtualizer.measureElement}
                        >
                          <SessionTimelineVirtualRow activeTurnId={activeTurnId} item={item} onForkFromTurn={onForkFromTurn} onRevertToMessage={onRevertToMessage} />
                        </div>
                      );
                    })}
                  </div>
                </div>
                {isStreaming && <StreamingStatus compacting={compacting} pullIntoLastMessage={pullStatusIntoLastMessage} ref={footerRef} setupStep={setupStep} />}
              </div>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <ScrollToEndButton bottomOffset={bottomOverlayHeight} onClick={onResumeAutoFollow} visible={scrollButtonVisible} />
        </MessageScroller>
      ) : (
        <TimelineEmptyState />
      )}
    </div>
  );
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const [autoFollowPausedByExpansion, setAutoFollowPausedByExpansion] = useState(false);
  const resumeAutoFollow = useCallback(() => setAutoFollowPausedByExpansion(false), []);
  const workExpansion = useWorkExpansionState(() => setAutoFollowPausedByExpansion(true));

  // DOM bounds can be fractional even at the native scroll limit.
  return (
    <MessageScrollerProvider autoScroll={!autoFollowPausedByExpansion} defaultScrollPosition="end" scrollEdgeThreshold={1}>
      <WorkExpansionContext value={workExpansion}>
        <SessionTimelineViewport {...props} autoFollowPausedByExpansion={autoFollowPausedByExpansion} onResumeAutoFollow={resumeAutoFollow} />
      </WorkExpansionContext>
    </MessageScrollerProvider>
  );
}
