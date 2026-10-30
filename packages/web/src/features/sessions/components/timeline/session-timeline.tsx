import {useMessageScroller, useMessageScrollerScrollable} from "@shadcn/react/message-scroller";
import type {SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
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

const TIMELINE_ANCHOR_SCROLL_DURATION_MS = 700;
const TIMELINE_ANCHOR_TOP_MARGIN_PX = 24;
const TIMELINE_BOTTOM_PADDING_PX = 16;
const TIMELINE_EARLIER_HISTORY_HEIGHT_PX = 48;
const TIMELINE_CACHE_LIMIT = 16;
const TIMELINE_SCROLL_BUTTON_THRESHOLD_PX = 50;
const TIMELINE_STREAM_SCROLL_ANIMATION_MS = 160;
const TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX = 56;

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
  /** In a fork, where its copied history ends. */
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
  readonly anchorFirstIndex: number | null;
  readonly onAnchorChange: (firstIndex: number | null) => void;
  readonly autoFollowPausedByExpansion: boolean;
  readonly onResumeAutoFollow: () => void;
}

function SessionTimelineViewport(props: SessionTimelineViewportProps) {
  const {
    anchorFirstIndex,
    bottomOverlayHeight = 0,
    compacting,
    autoFollowPausedByExpansion,
    onResumeAutoFollow,
    earlierHistory,
    isStreaming,
    items,
    lastCopiedTurnId,
    liveItems,
    onAnchorChange,
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
  const anchorSpaceRef = useRef<HTMLDivElement>(null);
  const anchorSpaceHeightRef = useRef(0);
  const realContentHeightRef = useRef<number | null>(null);
  const anchorContentRef = useRef<HTMLDivElement>(null);
  const anchorScrollRef = useRef<{row: VirtualItem; initialTop: number; offset: number; animation: Animation | null} | null>(null);
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
  const committedTurns = useMemo(() => ({ids: new Set(items.map((item) => item.turnId)), starts: items.filter((item) => item.type === "user").length}), [items]);
  // Live rows open a new turn, so their keys continue from the history's turn count.
  const tailRowKeySignature = buildTimelineRowKeys(timelineRows.slice(committedRowKeys.length), earlierHistory.count + committedTurns.starts).join(" ");
  const tailRowKeys = useMemo(() => (tailRowKeySignature ? tailRowKeySignature.split(" ") : []), [tailRowKeySignature]);
  const getItemKey = useCallback((index: number) => committedRowKeys[index] ?? tailRowKeys[index - committedRowKeys.length] ?? index, [committedRowKeys, tailRowKeys]);
  const firstRowKey = committedRowKeys[0] ?? tailRowKeys[0];
  const hasEarlierHistory = earlierHistory.count > 0;
  // The status sits in the canvas's top padding rather than in a row, so loaded turns go in below it.
  const paddingStart = TIMELINE_ANCHOR_TOP_MARGIN_PX + (hasEarlierHistory ? TIMELINE_EARLIER_HISTORY_HEIGHT_PX : 0);
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const hasLiveUserRow = liveItems[0]?.type === "user";
  const liveUserRowIndex = hasLiveUserRow ? committedRows.length : -1;
  const previousHasLiveUserRowRef = useRef(hasLiveUserRow);

  // Distinct, so a settling turn rendered by both projections counts once.
  const turnCount = committedTurns.ids.size + (activeTurnId !== null && !committedTurns.ids.has(activeTurnId) ? 1 : 0);
  const previousTurnCountRef = useRef(turnCount);

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
    // Measure a detached, tall prompt before pinning instead of waiting for it to enter the viewport.
    rangeExtractor: (range) => {
      // Keep the swept viewport mounted while its pixels move independently of native scrollTop.
      const indexes = defaultRangeExtractor(anchorFirstIndex === null ? range : {...range, startIndex: Math.min(range.startIndex, anchorFirstIndex)});
      if (liveUserRowIndex < 0 || indexes.includes(liveUserRowIndex)) return indexes;
      return [...indexes, liveUserRowIndex].toSorted((left, right) => left - right);
    },
    // Publish the new height before TanStack adjusts scrollTop, or the browser clamps against the old height.
    scrollToFn: (offset, options, instance) => {
      const virtualContent = virtualContentRef.current;
      if (virtualContent) virtualContent.style.height = `${instance.getTotalSize()}px`;
      elementScroll(offset, options, instance);
      // The offset already includes a pending prepend shift, so the DOM now carries it.
      if (prependRef.current) prependRef.current = {...prependRef.current, shift: 0};
      // A size correction must update the virtual range before paint, not wait for the next native scroll event.
      // Going through the offset observer also consumes TanStack's accumulated size adjustments.
      if (options.adjustments !== undefined && viewportRef.current) scrollOffsetChangedRef.current?.(viewportRef.current.scrollTop, false);
    },
  });

  const setAnchorSpaceHeight = useCallback((height: number): void => {
    anchorSpaceHeightRef.current = height;
    if (anchorSpaceRef.current) anchorSpaceRef.current.style.height = `${height}px`;
  }, []);

  const stopAnchorScroll = (): void => {
    const anchor = anchorScrollRef.current;
    anchorScrollRef.current = null;
    const viewport = viewportRef.current;
    const content = anchorContentRef.current;
    if (!anchor?.animation) return;
    // Hand user gestures the painted position, not the destination hidden behind the transform.
    const transform = content ? window.getComputedStyle(content).transform : "none";
    const offset = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
    anchor.animation.cancel();
    if (viewport && offset !== 0) viewport.scrollTop -= offset;
  };

  const releaseAnchorScroll = useCallback((): void => {
    stopAnchorScroll();
    onAnchorChange(null);
  }, [onAnchorChange]);

  // While pinning, space tracks geometry. Afterwards it is lossy: growth and scrolling up consume it.
  const syncAnchorSpace = useCallback(
    (viewport: HTMLDivElement): void => {
      const currentHeight = anchorSpaceHeightRef.current;
      const anchor = anchorScrollRef.current;
      if (currentHeight === 0 && !anchor) return;
      const space = anchorSpaceRef.current;
      if (!space) return;

      const viewportTop = viewport.getBoundingClientRect().top;
      // scrollHeight includes min-height: 100%, even when the transcript is short.
      const realContentHeight = space.getBoundingClientRect().top - viewportTop + viewport.scrollTop;
      const previousRealContentHeight = realContentHeightRef.current ?? realContentHeight;
      realContentHeightRef.current = realContentHeight;

      if (anchor) {
        // Retain the last measurement if settlement virtualizes the row away.
        anchor.row = virtualizer.getVirtualItems().find((row) => row.key === anchor.row.key) ?? anchor.row;
        const requiredHeight = Math.max(0, anchor.row.start - TIMELINE_ANCHOR_TOP_MARGIN_PX + viewport.clientHeight - realContentHeight);
        if (requiredHeight !== currentHeight) setAnchorSpaceHeight(requiredHeight);
        const end = Math.max(0, realContentHeight + requiredHeight - viewport.clientHeight);
        const offset = end - (anchor.row.start - anchor.initialTop);
        if (offset !== anchor.offset) {
          anchor.offset = offset;
          // Preserve the animation clock when measurements or streaming move its destination.
          (anchor.animation?.effect as KeyframeEffect | null)?.setKeyframes([{transform: `translateY(${offset}px)`}, {transform: "translateY(0)"}]);
        }
        if (anchor.animation && Math.abs(viewport.scrollTop - end) > 0.5) viewport.scrollTop = end;
        return;
      }

      const shrinkDelta = previousRealContentHeight - realContentHeight;
      if (shrinkDelta > 0) {
        setAnchorSpaceHeight(currentHeight + shrinkDelta);
        viewport.scrollTop += shrinkDelta;
        return;
      }

      const requiredHeight = viewport.scrollTop + viewport.clientHeight - realContentHeight;
      const nextHeight = Math.max(0, Math.min(currentHeight, requiredHeight));
      if (nextHeight !== currentHeight) setAnchorSpaceHeight(nextHeight);
    },
    [setAnchorSpaceHeight, virtualizer]
  );

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
    if (!previous || !current || !viewport || shouldReduceMotion || !isStreaming || !streamAnimationReadyRef.current || anchorScrollRef.current !== null) return;

    const footer = footerRef.current;
    const footerShift = current.footerTop - previous.footerTop;
    if (footer && footerShift > 0) footerAnimationRef.current = animateCatchUp(footer, -footerShift, footerAnimationRef.current, Number.POSITIVE_INFINITY);

    const scrolled = current.scrollTop - previous.scrollTop;
    const atEnd = viewport.scrollHeight - viewport.clientHeight - current.scrollTop <= 1;
    if (streamContentRef.current && atEnd && scrolled > 0 && scrolled <= TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX * 4) {
      streamScrollAnimationRef.current = animateCatchUp(streamContentRef.current, scrolled, streamScrollAnimationRef.current);
    }
  };

  // Consume anchor space before following, then animate the resulting movement.
  const syncViewport = (): void => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    syncAnchorSpace(viewport);
    if (!autoFollowPausedByExpansion && anchorScrollRef.current === null && !canScrollToEnd) scrollToEnd({behavior: "auto"});
    easeStreamGrowth();
  };

  // DOM offset, not TanStack's, which lags to the next scroll event.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
    if (prependRef.current && item.index < prependRef.current.beforeIndex) return true;
    return anchorScrollRef.current === null && anchorSpaceHeightRef.current === 0 && item.end <= (viewportRef.current?.scrollTop ?? 0);
  };

  // Prepended turns shift the scroll position in this render so rows on screen stay put; `shift` is what the DOM still
  // owes, `beforeIndex` marks the new rows so their measurement corrects it.
  const firstRowRef = useRef<{readonly key: string; readonly start: number} | null>(null);
  const prependRef = useRef<{readonly shift: number; readonly beforeIndex: number} | null>(null);
  const previousFirstRow = firstRowRef.current;
  const prependedIndex = previousFirstRow ? committedRowKeys.indexOf(previousFirstRow.key) : -1;
  virtualizer.getTotalSize();
  if (previousFirstRow && prependedIndex > 0) {
    const shift = (virtualizer.measurementsCache[prependedIndex]?.start ?? previousFirstRow.start) - previousFirstRow.start;
    virtualizer.scrollOffset = (virtualizer.scrollOffset ?? 0) + shift;
    prependRef.current = {shift: (prependRef.current?.shift ?? 0) + shift, beforeIndex: prependedIndex};
  }
  firstRowRef.current = firstRowKey === undefined ? null : {key: firstRowKey, start: virtualizer.measurementsCache[0]?.start ?? paddingStart};

  const virtualItems = virtualizer.getVirtualItems();

  const loadEarlierNearTop = (viewport: HTMLDivElement): void => {
    if (hasEarlierHistory && viewport.scrollTop < viewport.clientHeight) earlierHistory.load();
  };

  // Anchors a sent message near the top; space below it is consumed as the response grows.
  useLayoutEffect(() => {
    const hadLiveUserRow = previousHasLiveUserRowRef.current;
    previousHasLiveUserRowRef.current = hasLiveUserRow;
    if (!hasLiveUserRow || hadLiveUserRow) return;

    const viewport = viewportRef.current;
    const content = anchorContentRef.current;
    const row = virtualizer.getVirtualItems().find((item) => item.index === liveUserRowIndex);
    if (!viewport || !content || !row) return;

    onResumeAutoFollow();
    stopAnchorScroll();
    streamScrollAnimationRef.current?.cancel();
    // Sending from history reveals the new message first; never mount the entire history to animate across it.
    scrollToEnd({behavior: "auto"});
    const firstIndex = virtualizer.getVirtualItemForOffset(viewport.scrollTop)?.index ?? row.index;
    const anchor = {
      row,
      initialTop: row.start - viewport.scrollTop,
      offset: 0,
      animation: null as Animation | null,
    };
    anchorScrollRef.current = anchor;
    syncAnchorSpace(viewport);
    setScrollButtonVisible(false);

    const anchorScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (anchorScrollTop <= viewport.scrollTop || shouldReduceMotion) {
      viewport.scrollTop = anchorScrollTop;
      releaseAnchorScroll();
      return;
    }

    // Claim the viewport during commit, before auto-follow would jump to the anchored position next frame.
    onAnchorChange(firstIndex);

    anchor.animation = content.animate([{transform: `translateY(${anchor.offset}px)`}, {transform: "translateY(0)"}], {
      duration: TIMELINE_ANCHOR_SCROLL_DURATION_MS,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
    anchor.animation.onfinish = () => {
      if (anchorScrollRef.current === anchor) releaseAnchorScroll();
    };
    viewport.scrollTop = anchorScrollTop;
  }, [hasLiveUserRow, liveUserRowIndex, onAnchorChange, onResumeAutoFollow, releaseAnchorScroll, scrollToEnd, shouldReduceMotion, syncAnchorSpace, virtualizer]);

  // A revert removes turns: collapse the anchor space rather than let it swallow the removed height.
  useLayoutEffect(() => {
    const turnsReverted = turnCount < previousTurnCountRef.current;
    previousTurnCountRef.current = turnCount;
    if (!turnsReverted || (anchorSpaceHeightRef.current === 0 && anchorScrollRef.current === null)) return;

    releaseAnchorScroll();
    setAnchorSpaceHeight(0);
    realContentHeightRef.current = null;
    scrollToEnd({behavior: "auto"});
  }, [releaseAnchorScroll, scrollToEnd, setAnchorSpaceHeight, turnCount]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const prepend = prependRef.current;
    if (prepend) {
      // During user scrolling TanStack defers ref measurements to ResizeObserver. Finish the prepended overscan
      // before releasing its anchor, including new rows that occupy the old top padding.
      const measured = virtualItems.flatMap((item) => {
        const element = virtualizer.elementsCache.get(item.key);
        return item.index < prepend.beforeIndex && element ? [{index: item.index, height: element.offsetHeight}] : [];
      });
      for (const {index, height} of measured) virtualizer.resizeItem(index, height);
    }
    const shift = prependRef.current?.shift ?? 0;
    prependRef.current = null;
    if (!viewport) return;
    if (shift !== 0) viewport.scrollTop += shift;
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
      releaseAnchorScroll();
      onResumeAutoFollow();
    }
  };

  const handleViewportScroll = (event: UIEvent<HTMLDivElement>): void => {
    const viewport = event.currentTarget;
    const isAnchorScrolling = anchorScrollRef.current !== null;
    if (!isAnchorScrolling) syncAnchorSpace(viewport);
    measureStreamEnd();
    loadEarlierNearTop(viewport);
    setScrollButtonVisible(!isAnchorScrolling && viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop >= TIMELINE_SCROLL_BUTTON_THRESHOLD_PX);
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
      stopAnchorScroll();
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
              releaseAnchorScroll();
              onResumeAutoFollow();
            }}
            onWheel={() => {
              releaseAnchorScroll();
              onResumeAutoFollow();
            }}
            ref={viewportRef}
          >
            <MessageScrollerContent aria-busy={isStreaming} className="block min-h-full overflow-clip">
              <div ref={anchorContentRef}>
                <div
                  className="relative w-full overflow-clip"
                  data-timeline-virtual-content
                  ref={(element) => {
                    virtualContentRef.current = element;
                    virtualizer.containerRef(element);
                  }}
                >
                  {hasEarlierHistory && (
                    <EarlierHistoryStatus
                      failed={earlierHistory.failed}
                      height={TIMELINE_EARLIER_HISTORY_HEIGHT_PX}
                      onRetry={earlierHistory.retry}
                      top={TIMELINE_ANCHOR_TOP_MARGIN_PX}
                    />
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
              <div aria-hidden="true" className="shrink-0" data-timeline-fake-space ref={anchorSpaceRef} />
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

/** Auto-follow belongs to the message scroller except while a sent message is being anchored. */
export default function SessionTimeline(props: SessionTimelineProps) {
  const [anchorFirstIndex, setAnchorFirstIndex] = useState<number | null>(null);
  const [autoFollowPausedByExpansion, setAutoFollowPausedByExpansion] = useState(false);
  const resumeAutoFollow = useCallback(() => setAutoFollowPausedByExpansion(false), []);
  const workExpansion = useWorkExpansionState(() => setAutoFollowPausedByExpansion(true));

  // DOM bounds can be fractional even at the native scroll limit.
  return (
    <MessageScrollerProvider autoScroll={anchorFirstIndex === null && !autoFollowPausedByExpansion} defaultScrollPosition="end" scrollEdgeThreshold={1}>
      <WorkExpansionContext value={workExpansion}>
        <SessionTimelineViewport
          {...props}
          anchorFirstIndex={anchorFirstIndex}
          onAnchorChange={setAnchorFirstIndex}
          autoFollowPausedByExpansion={autoFollowPausedByExpansion}
          onResumeAutoFollow={resumeAutoFollow}
        />
      </WorkExpansionContext>
    </MessageScrollerProvider>
  );
}
