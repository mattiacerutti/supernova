import type {SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import {defaultRangeExtractor, observeElementOffset, observeElementRect, useVirtualizer} from "@tanstack/react-virtual";
import type {VirtualItem} from "@tanstack/react-virtual";
import {useReducedMotion} from "framer-motion";
import {useCallback, useLayoutEffect, useMemo, useRef, useState} from "react";
import type {KeyboardEvent, PointerEvent} from "react";
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
// DOM bounds can be fractional even at the native scroll limit.
const TIMELINE_END_THRESHOLD_PX = 1;
const TIMELINE_AUTOSCROLL_THUMB_HIDE_MS = 180;
const TIMELINE_EASE_MS = 160;
const TIMELINE_EASE_MAX_OFFSET_PX = 56;
const TIMELINE_SEND_EASE_MS = 320;
const TIMELINE_SEND_BUBBLE_MS = 380;
const TIMELINE_UPWARD_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);
const TIMELINE_SCROLL_KEYS = new Set([...TIMELINE_UPWARD_KEYS, "ArrowDown", "PageDown", "End", " "]);

const timelineCache = new Map<string, VirtualItem[]>();

function translateYOf(element: HTMLElement): number {
  const transform = window.getComputedStyle(element).transform;
  return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
}

/** Transform-only, so it runs on the compositor and never triggers layout while streaming. */
function easeFrom(element: HTMLElement, offset: number, current: Animation | null, maxOffset: number, duration = TIMELINE_EASE_MS): Animation {
  const start = Math.sign(offset) * Math.min(Math.abs(translateYOf(element) + offset), maxOffset);
  current?.cancel();
  return element.animate([{transform: `translateY(${start}px)`}, {transform: "translateY(0)"}], {duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)"});
}

interface ScreenRow {
  readonly key: VirtualItem["key"];
  readonly index: number;
  readonly start: number;
}

/** Only the reader changes it; layout changes only reapply it. */
type ScrollPosition = {readonly follow: true} | {readonly follow: false; readonly scrollTop: number; readonly rows: readonly ScreenRow[]};

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

export default function SessionTimeline(props: SessionTimelineProps) {
  const {
    bottomOverlayHeight = 0,
    compacting,
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const scrollOffsetChangedRef = useRef<((offset: number, isScrolling: boolean) => void) | null>(null);
  const positionRef = useRef<ScrollPosition>({follow: true});
  const easeRef = useRef<Animation | null>(null);
  const footerEaseRef = useRef<Animation | null>(null);
  const footerTopRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const touchYRef = useRef<number | null>(null);
  const autoscrollTimerRef = useRef<number | undefined>(undefined);
  const [scrollButtonVisible, setScrollButtonVisibleState] = useState(false);
  const scrollButtonVisibleRef = useRef(false);
  // Called on every streamed frame; an unchanged value set from a layout effect still costs React a render to bail out.
  const setScrollButtonVisible = (visible: boolean): void => {
    if (scrollButtonVisibleRef.current === visible) return;
    scrollButtonVisibleRef.current = visible;
    setScrollButtonVisibleState(visible);
  };
  const shouldReduceMotion = useReducedMotion();

  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  // The divider sits among the committed rows, so their keys and indexes stay one memoized run.
  const committedRows = useMemo(() => withForkDivider(items, lastCopiedTurnId), [items, lastCopiedTurnId]);
  const timelineRows = hasTimelineContent ? buildTimelineRows({items: committedRows, liveItems, streamError}) : [];
  const activeTurnId = liveItems[0]?.turnId ?? null;
  const hasLiveOutput = hasLiveTimelineOutput(liveItems);
  // Easing starts a frame after output first appears, so the frame that introduces it lays out without motion.
  const easeReadyRef = useRef(false);
  if (!hasLiveOutput) easeReadyRef.current = false;
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
  const liveUserRowIndex = liveItems[0]?.type === "user" ? committedRows.length : -1;
  // A send while following eases in further and longer.
  const sentRowKey = liveUserRowIndex < 0 ? null : getItemKey(liveUserRowIndex);
  const sentRowKeyRef = useRef(sentRowKey);
  const sendingRef = useRef(false);
  if (sentRowKey !== sentRowKeyRef.current) {
    sentRowKeyRef.current = sentRowKey;
    sendingRef.current = sentRowKey !== null && positionRef.current.follow;
  }

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: timelineRows.length,
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    estimateSize: () => 86,
    getItemKey,
    getScrollElement: () => viewportRef.current,
    initialMeasurementsCache: timelineCache.get(sessionId),
    observeElementOffset: (instance, onOffsetChange) => {
      scrollOffsetChangedRef.current = onOffsetChange;
      return observeElementOffset(instance, onOffsetChange);
    },
    observeElementRect: (instance, onRectChange) =>
      observeElementRect(instance, (rect) => {
        onRectChange(rect);
        keepPosition();
      }),
    onChange: (instance) => {
      // Direct DOM updates position only the new virtual range. Rows awaiting React's unmount still paint,
      // so keep those mounted rows in the same coordinate system after a measurement shifts the range.
      for (const [key, element] of instance.elementsCache) {
        const item = instance.measurementsCache[instance.indexFromElement(element)];
        if (item?.key !== key) continue;
        const top = `${item.start}px`;
        if (element.style.top !== top) element.style.top = top;
      }
      // Also while the reader scrolls: rows measured on the way in would otherwise shift what is on screen.
      keepPosition();
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
  });
  // The held position corrects for rows changing size; TanStack's own correction would correct twice.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;
  const virtualItems = virtualizer.getVirtualItems();

  /** The virtualizer's own viewport size, so remembering the rows costs no layout read. */
  const rowsOnScreen = (scrollTop: number): ScreenRow[] => {
    const bottom = scrollTop + (virtualizer.scrollRect?.height ?? 0);
    const rows: ScreenRow[] = [];
    for (let index = virtualizer.getVirtualItemForOffset(scrollTop)?.index ?? 0; index < virtualizer.options.count; index += 1) {
      const row = virtualizer.measurementsCache[index];
      if (!row || row.start >= bottom) break;
      // Only measured rows are where the reader sees them; an estimated one moves what follows once it is measured.
      if (row.end > scrollTop && virtualizer.itemSizeCache.has(row.key)) rows.push({key: row.key, index, start: row.start});
    }
    return rows;
  };

  const hold = (viewport: HTMLDivElement): void => {
    const scrollTop = viewport.scrollTop;
    positionRef.current = {follow: false, scrollTop, rows: rowsOnScreen(scrollTop)};
  };

  /** Where the held rows put the viewport now, or `null` when none of them is left to hold. */
  const heldScrollTop = ({rows, scrollTop}: Extract<ScrollPosition, {follow: false}>): number | null => {
    const {count} = virtualizer.options;
    let indexes: Map<VirtualItem["key"], number> | undefined;
    for (const row of rows) {
      let index = row.index < count && getItemKey(row.index) === row.key ? row.index : -1;
      if (index < 0) {
        indexes ??= new Map(Array.from({length: count}, (_, at) => [getItemKey(at), at]));
        index = indexes.get(row.key) ?? -1;
      }
      // Measured from the held scrollTop: the browser may since have clamped the live one against a shorter canvas.
      if (index >= 0) return scrollTop + virtualizer.measurementsCache[index]!.start - row.start;
    }
    const replacement = rows[0] && virtualizer.measurementsCache[rows[0].index];
    return replacement ? replacement.start - TIMELINE_TOP_PADDING_PX : null;
  };

  /** The only writer of the scroll position: after any change of rows, sizes or viewport, it puts the reader back. */
  const keepPosition = (): void => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    // The canvas holds the current total, so the browser does not clamp the new position against the old height.
    const total = `${virtualizer.getTotalSize()}px`;
    if (content.style.height !== total) content.style.height = total;
    const position = positionRef.current;
    const held = position.follow ? null : heldScrollTop(position);
    if (held === null) positionRef.current = {follow: true};
    // One layout read per call: this runs on every streamed frame and every row measurement.
    const before = viewport.scrollTop;
    const end = viewport.scrollHeight - viewport.clientHeight;
    const top = Math.max(0, Math.min(held ?? end, end));
    if (Math.abs(before - top) > 0.5) {
      viewport.scrollTop = top;
      // Synchronously, so the rows for the new position render before paint; keeping `isScrolling` avoids a re-render.
      scrollOffsetChangedRef.current?.(top, virtualizer.isScrolling);
    }
    lastScrollTopRef.current = top;
    if (held === null) easeFollowing(viewport, top - before);
    else hold(viewport);
    easeFooter(top);
    setScrollButtonVisible(end - top >= TIMELINE_SCROLL_BUTTON_THRESHOLD_PX);
  };

  // Following jumps as rows grow; easing back from each jump smooths it. Larger jumps are not streamed growth.
  const easeFollowing = (viewport: HTMLDivElement, scrolled: number): void => {
    const content = contentRef.current;
    if (scrolled <= 0 || !content) return;
    viewport.dataset.autoscrolling = "";
    window.clearTimeout(autoscrollTimerRef.current);
    autoscrollTimerRef.current = window.setTimeout(() => delete viewport.dataset.autoscrolling, TIMELINE_AUTOSCROLL_THUMB_HIDE_MS);
    if (shouldReduceMotion) return;
    if (sendingRef.current) {
      const offset = Math.min(scrolled, virtualizer.scrollRect?.height ?? scrolled);
      easeRef.current = easeFrom(content, offset, easeRef.current, Number.POSITIVE_INFINITY, TIMELINE_SEND_EASE_MS);
      if (footerRef.current) footerEaseRef.current = easeFrom(footerRef.current, offset, footerEaseRef.current, Number.POSITIVE_INFINITY, TIMELINE_SEND_EASE_MS);
    } else if (easeReadyRef.current && scrolled <= TIMELINE_EASE_MAX_OFFSET_PX * 4) {
      easeRef.current = easeFrom(content, scrolled, easeRef.current, TIMELINE_EASE_MAX_OFFSET_PX);
    }
  };

  /** Derived from the canvas height, so it costs no layout read. */
  const easeFooter = (scrollTop: number): void => {
    const footer = footerRef.current;
    const top = footer ? virtualizer.getTotalSize() - scrollTop : null;
    const previous = footerTopRef.current;
    footerTopRef.current = top;
    if (!footer || top === null || previous === null || top <= previous || shouldReduceMotion || !easeReadyRef.current || sendingRef.current) return;
    footerEaseRef.current = easeFrom(footer, previous - top, footerEaseRef.current, Number.POSITIVE_INFINITY);
  };

  /** The reader's gesture starts from what is painted, not from the destination hidden behind an ease. */
  const stopEase = (viewport: HTMLDivElement): void => {
    const ease = easeRef.current;
    const content = contentRef.current;
    if (ease?.playState !== "running" || !content) return;
    const offset = translateYOf(content);
    ease.cancel();
    viewport.scrollTop -= offset;
  };

  // Every row that shows work reads this context, so its value must keep its identity across streamed frames.
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const onToggleWork = useCallback(() => viewportRef.current && holdRef.current(viewportRef.current), []);
  const {expanded: workExpanded, measurements: workMeasurements} = useWorkExpansionState(onToggleWork);
  const workExpansion = useMemo(() => ({expanded: workExpanded, measurements: workMeasurements, onToggle: onToggleWork}), [workExpanded, workMeasurements, onToggleWork]);

  const loadEarlierNearTop = (viewport: HTMLDivElement): void => {
    if (hasEarlierHistory && viewport.scrollTop < viewport.clientHeight) earlierHistory.load();
  };

  useLayoutEffect(() => {
    keepPosition();
    const viewport = viewportRef.current;
    const sending = sendingRef.current;
    sendingRef.current = false;
    if (!viewport) return;
    // Without enough content to scroll, no scroll event would ever ask for more.
    if (viewport.scrollHeight - viewport.clientHeight < viewport.clientHeight) loadEarlierNearTop(viewport);
    if (!sending || sentRowKey === null || shouldReduceMotion) return;
    virtualizer.elementsCache
      .get(sentRowKey)
      ?.querySelector("article")
      ?.animate(
        [
          {transform: "translateY(24px) scale(0.82)", transformOrigin: "100% 100%", opacity: 0.6},
          {transform: "none", transformOrigin: "100% 100%", opacity: 1},
        ],
        {duration: TIMELINE_SEND_BUBBLE_MS, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)"}
      );
  });

  useLayoutEffect(() => {
    if (!hasLiveOutput) return;
    const frame = window.requestAnimationFrame(() => {
      easeReadyRef.current = true;
      if (viewportRef.current) footerTopRef.current = footerRef.current ? virtualizer.getTotalSize() - viewportRef.current.scrollTop : null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hasLiveOutput, virtualizer]);

  useLayoutEffect(
    () => () => {
      easeRef.current?.cancel();
      footerEaseRef.current?.cancel();
      window.clearTimeout(autoscrollTimerRef.current);
      if (virtualizer.options.count === 0) return;

      timelineCache.delete(sessionId);
      timelineCache.set(sessionId, virtualizer.takeSnapshot());
      while (timelineCache.size > TIMELINE_CACHE_LIMIT) timelineCache.delete(timelineCache.keys().next().value!);
    },
    [sessionId, virtualizer]
  );

  /** An upward gesture holds the place before its scroll lands, so following cannot pull it back meanwhile. */
  const readerScrolls = (viewport: HTMLDivElement, upward: boolean): void => {
    if (!upward) return;
    stopEase(viewport);
    hold(viewport);
  };

  // Only the reader's scrolling lands here unchanged: the timeline's own writes already left the position in place.
  const handleScroll = (viewport: HTMLDivElement): void => {
    const scrollTop = viewport.scrollTop;
    if (scrollTop === lastScrollTopRef.current) return;
    const movedUp = scrollTop < lastScrollTopRef.current - 0.5;
    lastScrollTopRef.current = scrollTop;
    const fromEnd = viewport.scrollHeight - viewport.clientHeight - scrollTop;
    if (fromEnd <= TIMELINE_END_THRESHOLD_PX) positionRef.current = {follow: true};
    else if (movedUp || !positionRef.current.follow) hold(viewport);
    footerTopRef.current = footerRef.current ? virtualizer.getTotalSize() - scrollTop : null;
    loadEarlierNearTop(viewport);
    setScrollButtonVisible(fromEnd >= TIMELINE_SCROLL_BUTTON_THRESHOLD_PX);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || target.isContentEditable || target.closest("input, textarea, select")) return;
    if (event.key === " " && target.closest("button")) return;
    if (TIMELINE_SCROLL_KEYS.has(event.key)) readerScrolls(event.currentTarget, TIMELINE_UPWARD_KEYS.has(event.key) || (event.key === " " && event.shiftKey));
  };

  // Virtualized rows have no per-turn ancestor, so each row of the hovered group is flagged. A turn's user
  // message is its own group; otherwise hovering it would reveal the assistant's actions, and vice versa.
  const setHoveredTurn = (viewport: HTMLDivElement, hoverGroup: string | undefined): void => {
    for (const row of viewport.querySelectorAll<HTMLElement>("[data-hover-group]"))
      row.classList.toggle("turn-hover", hoverGroup !== undefined && row.dataset.hoverGroup === hoverGroup);
  };

  const handlePointerOver = (event: PointerEvent<HTMLDivElement>): void => {
    setHoveredTurn(event.currentTarget, (event.target as HTMLElement).closest<HTMLElement>("[data-hover-group]")?.dataset.hoverGroup);
  };

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {hasTimelineContent ? (
        <>
          <div
            aria-label="Session timeline"
            className="scroll-fade-y size-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain contain-content [scrollbar-gutter:stable] data-autoscrolling:scrollbar-thumb-transparent data-autoscrolling:scrollbar-track-transparent"
            data-slot="timeline-viewport"
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
              // A scrollbar drag lands on the viewport itself.
              if (event.target === event.currentTarget) readerScrolls(event.currentTarget, true);
            }}
            onPointerLeave={(event) => setHoveredTurn(event.currentTarget, undefined)}
            onPointerOver={handlePointerOver}
            onScroll={(event) => handleScroll(event.currentTarget)}
            onTouchMove={(event) => {
              const y = event.touches[0]?.clientY ?? null;
              // A finger moving down scrolls the content up.
              readerScrolls(event.currentTarget, y !== null && touchYRef.current !== null && y > touchYRef.current);
              touchYRef.current = y;
            }}
            onTouchStart={(event) => {
              touchYRef.current = event.touches[0]?.clientY ?? null;
            }}
            onWheel={(event) => readerScrolls(event.currentTarget, event.deltaY < 0)}
            ref={viewportRef}
            role="region"
            tabIndex={0}
          >
            <div aria-busy={isStreaming} aria-relevant="additions" className="min-h-full overflow-clip" role="log">
              <div
                className="relative w-full overflow-clip"
                data-timeline-stream-content
                data-timeline-virtual-content
                ref={(element) => {
                  contentRef.current = element;
                  virtualizer.containerRef(element);
                }}
              >
                {hasEarlierHistory && (
                  <EarlierHistoryStatus failed={earlierHistory.failed} height={TIMELINE_EARLIER_HISTORY_HEIGHT_PX} onRetry={earlierHistory.retry} top={TIMELINE_TOP_PADDING_PX} />
                )}
                <WorkExpansionContext value={workExpansion}>
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
                </WorkExpansionContext>
              </div>
              {isStreaming && <StreamingStatus compacting={compacting} pullIntoLastMessage={pullStatusIntoLastMessage} ref={footerRef} setupStep={setupStep} />}
            </div>
          </div>
          <ScrollToEndButton
            bottomOffset={bottomOverlayHeight}
            onClick={() => {
              positionRef.current = {follow: true};
              keepPosition();
            }}
            visible={scrollButtonVisible}
          />
        </>
      ) : (
        <TimelineEmptyState />
      )}
    </div>
  );
}
