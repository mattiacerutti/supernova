import {useMessageScroller, useMessageScrollerScrollable} from "@shadcn/react/message-scroller";
import type {SessionSetupStep} from "@supernova/contracts/services/session-runtime/procedures";
import {defaultRangeExtractor, elementScroll, useVirtualizer} from "@tanstack/react-virtual";
import type {VirtualItem} from "@tanstack/react-virtual";
import {animate, motionValue, useReducedMotion} from "framer-motion";
import type {MotionValue} from "framer-motion";
import {useCallback, useLayoutEffect, useRef, useState} from "react";
import type {KeyboardEvent, PointerEvent, UIEvent} from "react";
import {MessageScroller, MessageScrollerContent, MessageScrollerProvider, MessageScrollerViewport} from "@/features/sessions/components/timeline/viewport/message-scroller";
import EarlierHistoryStatus from "@/features/sessions/components/timeline/viewport/earlier-history-status";
import ScrollToEndButton from "@/features/sessions/components/timeline/viewport/scroll-to-end-button";
import SessionTimelineVirtualRow from "@/features/sessions/components/timeline/rows/session-timeline-virtual-row";
import StreamingStatus from "@/features/sessions/components/timeline/viewport/streaming-status";
import TimelineEmptyState from "@/features/sessions/components/timeline/viewport/timeline-empty-state";
import {buildTimelineRowKeys, buildTimelineRows, hasLiveTimelineOutput} from "@/features/sessions/lib/timeline/rows/timeline-rows";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

const TIMELINE_ANCHOR_SCROLL_DURATION_MS = 700;
const TIMELINE_ANCHOR_TOP_MARGIN_PX = 24;
const TIMELINE_BOTTOM_PADDING_PX = 16;
const TIMELINE_EARLIER_HISTORY_HEIGHT_PX = 48;
// Bounds retained measurement snapshots used when switching between sessions.
const TIMELINE_CACHE_LIMIT = 16;
const TIMELINE_SCROLL_BUTTON_THRESHOLD_PX = 50;
// Lets streamed rows (or the status footer) visually catch up after content
// growth instantly moves them.
const TIMELINE_STREAM_SCROLL_ANIMATION_MS = 160;
const TIMELINE_STREAM_SCROLL_MAX_OFFSET_PX = 56;

const timelineCache = new Map<string, VirtualItem[]>();

/**
 * Starts `element` displaced by `offset` px and eases it to its layout position,
 * stacking onto any displacement still in flight. Transform-only, so it runs on
 * the compositor and never triggers layout while the stream renders.
 */
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

/** Turns before the first loaded one, and loading them. */
export interface TimelineEarlierHistory {
  readonly count: number;
  readonly failed: boolean;
  readonly load: () => void;
  readonly retry: () => void;
}

interface SessionTimelineProps {
  readonly bottomOverlayHeight?: number;
  readonly earlierHistory: TimelineEarlierHistory;
  readonly compacting: boolean;
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
  readonly onAnchorScrollingChange: (anchorScrolling: boolean) => void;
}

function SessionTimelineViewport(props: SessionTimelineViewportProps) {
  const {
    bottomOverlayHeight = 0,
    compacting,
    earlierHistory,
    isStreaming,
    items,
    liveItems,
    onAnchorScrollingChange,
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
  const streamContentRef = useRef<HTMLDivElement>(null);
  const anchorSpaceRef = useRef<HTMLDivElement>(null);
  const anchorSpaceHeightRef = useRef(0);
  const realContentHeightRef = useRef<number | null>(null);
  const anchorScrollRef = useRef<{row: VirtualItem; initialTop: number; progress: MotionValue<number>} | null>(null);
  const streamAnimationReadyRef = useRef(false);
  const streamScrollAnimationRef = useRef<Animation | null>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const footerAnimationRef = useRef<Animation | null>(null);

  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  const timelineRows = hasTimelineContent ? buildTimelineRows({items, liveItems, streamError}) : [];
  const activeTurnId = liveItems[0]?.turnId ?? null;
  const hasLiveOutput = hasLiveTimelineOutput(liveItems);
  if (!hasLiveOutput) streamAnimationReadyRef.current = false;

  const pullStatusIntoLastMessage = hasLiveOutput && liveItems.at(-1)?.spacing === "message";
  const virtualRowKeys = buildTimelineRowKeys(timelineRows, earlierHistory.count);
  const hasEarlierHistory = earlierHistory.count > 0;
  // The status sits in the canvas's top padding rather than in a row, so loaded turns go in below it.
  const paddingStart = TIMELINE_ANCHOR_TOP_MARGIN_PX + (hasEarlierHistory ? TIMELINE_EARLIER_HISTORY_HEIGHT_PX : 0);
  const [scrollButtonVisible, setScrollButtonVisible] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const hasLiveUserRow = liveItems[0]?.type === "user";
  const liveUserRowIndex = hasLiveUserRow ? items.length : -1;
  const previousHasLiveUserRowRef = useRef(hasLiveUserRow);

  // Distinct so a settling turn rendered by both projections counts once. The
  // count only decreases when checkpoint navigation reverts turns away.
  const turnCount = new Set([...items, ...liveItems].map((item) => item.turnId)).size;
  const previousTurnCountRef = useRef(turnCount);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: timelineRows.length,
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    estimateSize: () => 86,
    // Only Message Scroller follows the bottom. TanStack preserves detached
    // content when measurements above the viewport change.
    onChange: (_instance, scrolling) => {
      if (!scrolling) syncViewport();
    },
    getItemKey: (index) => virtualRowKeys[index] ?? index,
    getScrollElement: () => viewportRef.current,
    initialMeasurementsCache: timelineCache.get(sessionId),
    overscan: 3,
    paddingEnd: TIMELINE_BOTTOM_PADDING_PX,
    paddingStart,
    // Measure even a detached, tall prompt before pinning; do not wait for
    // its estimated position to enter the viewport.
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (liveUserRowIndex < 0 || indexes.includes(liveUserRowIndex)) return indexes;
      return [...indexes, liveUserRowIndex].toSorted((left, right) => left - right);
    },
    // TanStack adjusts scrollTop before notifying React about a measured size.
    // Publish the new virtual height first so the browser does not clamp that
    // adjustment against the previous height and visibly correct a frame later.
    scrollToFn: (offset, options, instance) => {
      const virtualContent = virtualContentRef.current;
      if (virtualContent) virtualContent.style.height = `${instance.getTotalSize()}px`;
      elementScroll(offset, options, instance);
      // The offset already includes a pending prepend shift, so the DOM now carries it.
      if (prependRef.current) prependRef.current = {...prependRef.current, shift: 0};
    },
  });

  const setAnchorSpaceHeight = useCallback((height: number): void => {
    anchorSpaceHeightRef.current = height;
    if (anchorSpaceRef.current) anchorSpaceRef.current.style.height = `${height}px`;
  }, []);

  // Clearing ownership first makes the animation's final sample a no-op.
  const stopAnchorScroll = (): void => {
    const anchor = anchorScrollRef.current;
    anchorScrollRef.current = null;
    anchor?.progress.stop();
  };

  const releaseAnchorScroll = useCallback((): void => {
    stopAnchorScroll();
    onAnchorScrollingChange(false);
  }, [onAnchorScrollingChange]);

  // Pinning tracks current geometry. Afterwards, space is lossy: growth and
  // upward scrolling consume it, while shrinkage is replaced to avoid clamping.
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
        // The canvas starts at the scroll origin, so row.start is its scroll
        // offset. Retain the last measurement if settlement virtualizes it away.
        anchor.row = virtualizer.getVirtualItems().find((row) => row.key === anchor.row.key) ?? anchor.row;
        const requiredHeight = Math.max(0, anchor.row.start - TIMELINE_ANCHOR_TOP_MARGIN_PX + viewport.clientHeight - realContentHeight);
        if (requiredHeight !== currentHeight) setAnchorSpaceHeight(requiredHeight);
        // ResizeObserver and stream commits can change the destination between
        // animation frames. Apply the current progress before those changes paint.
        const end = Math.max(0, realContentHeight + requiredHeight - viewport.clientHeight);
        // The initial screen position is fixed even when history above is remeasured.
        const start = anchor.row.start - anchor.initialTop;
        viewport.scrollTop = start + (end - start) * anchor.progress.get();
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

  // Growth is detected by comparing the footer's layout position and scrollTop
  // against the previous commit, not from the virtualizer's scroll delta: the
  // message scroller's own auto-follow may have already scrolled.
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

  // One commit boundary for React updates and virtualizer measurements.
  // Consume anchor space before following, then animate the resulting movement.
  const syncViewport = (): void => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    syncAnchorSpace(viewport);
    if (anchorScrollRef.current === null && !canScrollToEnd) scrollToEnd({behavior: "auto"});
    easeStreamGrowth();
  };

  // Compare against the DOM offset: TanStack's own offset only updates on the
  // next scroll event, while scrollToFn above applies each adjustment in this
  // measurement batch synchronously and without clamping.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
    if (prependRef.current && item.index < prependRef.current.beforeIndex) return true;
    return anchorScrollRef.current === null && anchorSpaceHeightRef.current === 0 && item.end <= (viewportRef.current?.scrollTop ?? 0);
  };

  // Earlier turns loaded above move the previous first row down; the scroll position moves with it in this render,
  // before the range is computed, so the rows on screen stay rendered and in place. The new rows are laid out from
  // estimates; `shift` is what the DOM still has to scroll, and `beforeIndex` marks them so their measurement
  // corrects the scroll position as for rows above the viewport, which they are once the shift lands.
  const firstRowRef = useRef<{readonly key: string; readonly start: number} | null>(null);
  const prependRef = useRef<{readonly shift: number; readonly beforeIndex: number} | null>(null);
  const previousFirstRow = firstRowRef.current;
  const prependedIndex = previousFirstRow ? virtualRowKeys.indexOf(previousFirstRow.key) : -1;
  virtualizer.getTotalSize();
  if (previousFirstRow && prependedIndex > 0) {
    const shift = (virtualizer.measurementsCache[prependedIndex]?.start ?? previousFirstRow.start) - previousFirstRow.start;
    virtualizer.scrollOffset = (virtualizer.scrollOffset ?? 0) + shift;
    prependRef.current = {shift: (prependRef.current?.shift ?? 0) + shift, beforeIndex: prependedIndex};
  }
  firstRowRef.current = virtualRowKeys[0] === undefined ? null : {key: virtualRowKeys[0], start: virtualizer.measurementsCache[0]?.start ?? paddingStart};

  const virtualItems = virtualizer.getVirtualItems();

  /** Loads earlier turns once the viewport is within a screen of the top. */
  const loadEarlierNearTop = (viewport: HTMLDivElement): void => {
    if (hasEarlierHistory && viewport.scrollTop < viewport.clientHeight) earlierHistory.load();
  };

  // Anchors a freshly sent message near the viewport top. Space below it makes
  // that position the scroll end and is consumed as the response grows.
  useLayoutEffect(() => {
    const hadLiveUserRow = previousHasLiveUserRowRef.current;
    previousHasLiveUserRowRef.current = hasLiveUserRow;
    if (!hasLiveUserRow || hadLiveUserRow) return;

    const viewport = viewportRef.current;
    const row = virtualizer.getVirtualItems().find((item) => item.index === liveUserRowIndex);
    if (!viewport || !row) return;

    // A followed timeline shows the message at the bottom first, like any
    // appended row, so the scroll eases up from where the message appeared.
    stopAnchorScroll();
    streamScrollAnimationRef.current?.cancel();
    if (!canScrollToEnd) scrollToEnd({behavior: "auto"});
    const anchor = {row, initialTop: row.start - viewport.scrollTop, progress: motionValue(0)};
    anchorScrollRef.current = anchor;
    syncAnchorSpace(viewport);
    setScrollButtonVisible(false);

    const anchorScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (anchorScrollTop <= viewport.scrollTop || shouldReduceMotion) {
      viewport.scrollTop = anchorScrollTop;
      releaseAnchorScroll();
      return;
    }

    // The message scroller's auto-follow reacts to the new anchor space one
    // frame later and would jump straight to the anchored position, so it hands
    // the viewport to this transition until the scroll settles or the user
    // takes over. Claiming here, during commit, lands before that frame.
    onAnchorScrollingChange(true);

    // The message paints at the bottom on this frame. Starting the animation on
    // the next one keeps its clock aligned with painted frames, so a slow commit
    // cannot make the first visible step skip ahead.
    window.requestAnimationFrame(() => {
      if (anchorScrollRef.current !== anchor) return;

      // Animate progress, not a captured pixel destination. Keep the message
      // pinned against current geometry, or follow the response when it has
      // outgrown the viewport, without handing scrolling off mid-transition.
      animate(anchor.progress, 1, {
        duration: TIMELINE_ANCHOR_SCROLL_DURATION_MS / 1_000,
        ease: [0.16, 1, 0.3, 1],
        onComplete: releaseAnchorScroll,
        onUpdate: () => {
          if (anchorScrollRef.current === anchor) syncAnchorSpace(viewport);
        },
      });
    });
  }, [canScrollToEnd, hasLiveUserRow, liveUserRowIndex, onAnchorScrollingChange, releaseAnchorScroll, scrollToEnd, shouldReduceMotion, syncAnchorSpace, virtualizer]);

  // Anchor space only exists so a sent message can hold the viewport top while
  // its response grows below. When a revert removes turns that purpose is gone,
  // so collapse the space instead of letting it swallow the removed height.
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
    const shift = prependRef.current?.shift ?? 0;
    prependRef.current = null;
    if (!viewport) return;
    if (shift !== 0) viewport.scrollTop += shift;
    // Without enough content to scroll, no scroll event would ever ask for more.
    if (viewport.scrollHeight - viewport.clientHeight < viewport.clientHeight) loadEarlierNearTop(viewport);
  });

  useLayoutEffect(syncViewport);

  // Virtualized rows share no per-turn ancestor, so the hovered turn is flagged
  // on each of its rows instead.
  const setHoveredTurn = (viewport: HTMLDivElement, turnId: string | undefined): void => {
    for (const row of viewport.querySelectorAll<HTMLElement>("[data-turn-id]")) row.classList.toggle("turn-hover", turnId !== undefined && row.dataset.turnId === turnId);
  };

  const handleViewportPointerOver = (event: PointerEvent<HTMLDivElement>): void => {
    setHoveredTurn(event.currentTarget, (event.target as HTMLElement).closest<HTMLElement>("[data-turn-id]")?.dataset.turnId);
  };

  const handleViewportPointerLeave = (event: PointerEvent<HTMLDivElement>): void => {
    setHoveredTurn(event.currentTarget, undefined);
  };

  const handleViewportKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || target.isContentEditable || target.closest("input, textarea, select")) return;
    if (event.key === " " && target.closest("button")) return;
    // Message Scroller cancels its own scrolling on these keys, not our animation.
    if (["ArrowUp", "ArrowDown", "Home", "PageUp", "PageDown", " "].includes(event.key)) releaseAnchorScroll();
  };

  const handleViewportScroll = (event: UIEvent<HTMLDivElement>): void => {
    const viewport = event.currentTarget;
    const isAnchorScrolling = anchorScrollRef.current !== null;
    syncAnchorSpace(viewport);
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
            onPointerOver={handleViewportPointerOver}
            onScroll={handleViewportScroll}
            onTouchMove={releaseAnchorScroll}
            onWheel={releaseAnchorScroll}
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
                        data-turn-id={item.turnId}
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
              <div aria-hidden="true" className="shrink-0" data-timeline-fake-space ref={anchorSpaceRef} />
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <ScrollToEndButton bottomOffset={bottomOverlayHeight} visible={scrollButtonVisible} />
        </MessageScroller>
      ) : (
        <TimelineEmptyState />
      )}
    </div>
  );
}

/**
 * Renders the virtualized session transcript. Auto-follow belongs to the
 * message scroller except while a newly sent message is being anchored to the
 * viewport top; that transition owns the scroll position until it settles.
 */
export default function SessionTimeline(props: SessionTimelineProps) {
  const [anchorScrolling, setAnchorScrolling] = useState(false);

  // DOM bounds can be fractional even at the native scroll limit.
  return (
    <MessageScrollerProvider autoScroll={!anchorScrolling} defaultScrollPosition="end" scrollEdgeThreshold={1}>
      <SessionTimelineViewport {...props} onAnchorScrollingChange={setAnchorScrolling} />
    </MessageScrollerProvider>
  );
}
