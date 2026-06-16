import {defaultRangeExtractor, elementScroll, useVirtualizer} from "@tanstack/react-virtual";
import type {ReactVirtualizer, VirtualItem} from "@tanstack/react-virtual";
import {useCallback, useLayoutEffect, useRef, useState} from "react";
import type {PointerEvent, UIEvent, WheelEvent} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SessionTimelineVirtualRow from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import type {TimelineVirtualItem} from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

const TIMELINE_BOTTOM_PADDING_PX = 24;
const TIMELINE_CACHE_LIMIT = 16;
const TIMELINE_FALLBACK_ITEM_SIZE = 60;
const SCROLL_END_THRESHOLD_PX = 2;
const SCROLL_GESTURE_WINDOW_MS = 250;
const SHORT_SCROLL_SETTLE_FRAMES = 4;

type TimelineVirtualizer = ReactVirtualizer<HTMLDivElement, HTMLDivElement>;

interface TimelineScrollState {
  readonly bottom: boolean;
  readonly jump: boolean;
  readonly overflow: boolean;
}

const initialScrollState = {bottom: true, jump: false, overflow: false} satisfies TimelineScrollState;
const timelineCache = new Map<string, {measurements: VirtualItem[]}>();

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

function timelineItemContentVersion(item: SessionTimelineItem): string {
  switch (item.type) {
    case "assistant":
      return `${item.id}:${item.live ? "live" : "done"}:${item.event.content.length}:${item.event.error ?? ""}`;
    case "compaction":
      return `${item.id}:${item.event.status}:${item.event.summary?.length ?? 0}:${item.event.error ?? ""}`;
    case "user":
      return `${item.id}:${item.message.contentParts.length}`;
    case "work":
      return `${item.id}:${item.live ? "live" : "done"}:${item.events
        .map((event) => {
          if (event.type === "reasoning") return `${event.id}:reasoning:${event.content.length}`;
          return `${event.id}:tool:${event.tool?.status ?? "none"}:${JSON.stringify(event.tool ?? {}).length}`;
        })
        .join(",")}`;
  }
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

function jumpThreshold(element: HTMLElement): number {
  return Math.max(400, element.clientHeight);
}

function scrollStateFor(element: HTMLElement): TimelineScrollState {
  const max = element.scrollHeight - element.clientHeight;
  const distance = max - element.scrollTop;
  const overflow = max > 1;

  return {
    bottom: !overflow || distance <= SCROLL_END_THRESHOLD_PX,
    jump: overflow && distance > jumpThreshold(element),
    overflow,
  };
}

function sameScrollState(a: TimelineScrollState, b: TimelineScrollState): boolean {
  return a.bottom === b.bottom && a.jump === b.jump && a.overflow === b.overflow;
}

function normalizeWheelDelta(input: {readonly deltaMode: number; readonly deltaY: number; readonly rootHeight: number}): number {
  if (input.deltaMode === 1) return input.deltaY * 40;
  if (input.deltaMode === 2) return input.deltaY * input.rootHeight;
  return input.deltaY;
}

function shouldMarkBoundaryGesture(input: {readonly clientHeight: number; readonly delta: number; readonly scrollHeight: number; readonly scrollTop: number}): boolean {
  const max = input.scrollHeight - input.clientHeight;
  if (max <= 1) return true;
  if (!input.delta) return false;

  if (input.delta < 0) return input.scrollTop + input.delta <= 0;

  const remaining = max - input.scrollTop;
  return input.delta > remaining;
}

function boundaryTarget(root: HTMLElement, target: EventTarget | null): HTMLElement {
  const current = target instanceof Element ? target : undefined;
  const nested = current?.closest("[data-scrollable]");
  if (!nested || nested === root) return root;
  if (!(nested instanceof HTMLElement)) return root;
  return nested;
}

interface VirtualTimelineRowProps {
  readonly activeTurnId: string | null;
  readonly inlineStatusLabel?: string;
  readonly item: TimelineVirtualItem;
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly virtualItem: VirtualItem;
  readonly virtualizer: TimelineVirtualizer;
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
      data-timeline-key={String(virtualItem.key)}
      style={{
        height: `${virtualItem.size}px`,
        left: 0,
        overflow: inlineStatusLabel ? "visible" : "clip",
        position: "absolute",
        top: `${virtualItem.start}px`,
        width: "100%",
      }}
    >
      <div data-index={virtualItem.index} ref={setMeasuredElement}>
        <SessionTimelineVirtualRow activeTurnId={activeTurnId} inlineStatusLabel={inlineStatusLabel} item={item} onRevertToMessage={onRevertToMessage} />
      </div>
    </div>
  );
}

interface SessionTimelineProps {
  readonly compacting: boolean;
  readonly forceFollow: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly sessionId: string;
  readonly streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {compacting, forceFollow, isStreaming, items, liveItems, onRevertToMessage, sessionId, streamError} = props;

  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  const timelineRows = hasTimelineContent ? buildTimelineRows({compacting, isStreaming, items, liveItems, streamError}) : [];
  const rowByKey = new Map(timelineRows.map((item) => [item.id, item] as const));
  const activeTurnId = liveItems[0]?.turnId ?? null;
  const activeRowIndex = activeTurnId ? timelineRows.findLastIndex((item) => "turnId" in item && item.turnId === activeTurnId) : -1;
  const inlineStatusItemId = isStreaming && hasLiveTimelineOutput(liveItems) && !hasPendingToolCall(liveItems) ? liveItems.at(-1)?.id : undefined;
  const inlineStatusLabel = inlineStatusItemId ? streamingStatusLabel(compacting) : undefined;
  const activeContentVersion = [isStreaming ? "streaming" : "idle", compacting ? "compacting" : "chat", streamError ?? "", ...liveItems.map(timelineItemContentVersion)].join("|");
  const rowKeysSignature = timelineRows.map((item) => item.id).join("\u0000");

  const cachedRef = useRef(timelineCache.get(sessionId));
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const virtualContentRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);
  const scrollGestureRef = useRef(0);
  const scrollbarGestureRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollStateFrameRef = useRef<number | null>(null);
  const scrollStateTargetRef = useRef<HTMLElement | null>(null);
  const resizePinnedIndexesRef = useRef<number[]>([]);
  const resizePinFrameRef = useRef<number | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const previousActiveTurnIdRef = useRef(activeTurnId);
  const forceFollowSnapshotRef = useRef({activeContentVersion, forceFollow, rowKeysSignature});
  const pendingForceFollowRef = useRef(false);
  const latestRowsLengthRef = useRef(timelineRows.length);
  const latestSessionIdRef = useRef(sessionId);

  const [renderOverscan, setRenderOverscan] = useState(() => (cachedRef.current?.measurements.length || !userScrolledRef.current ? 6 : 20));
  const [scrollState, setScrollState] = useState<TimelineScrollState>(initialScrollState);
  const [userScrolled, setUserScrolledState] = useState(false);

  latestRowsLengthRef.current = timelineRows.length;
  latestSessionIdRef.current = sessionId;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    anchorTo: "end",
    count: timelineRows.length,
    estimateSize: () => TIMELINE_FALLBACK_ITEM_SIZE,
    followOnAppend: true,
    getItemKey: (index) => timelineRows[index]?.id ?? `removed:${index}`,
    getScrollElement: () => scrollRootRef.current,
    initialMeasurementsCache: cachedRef.current?.measurements,
    initialOffset: () => (userScrolledRef.current ? 0 : Number.MAX_SAFE_INTEGER),
    overscan: 50,
    paddingEnd: TIMELINE_BOTTOM_PADDING_PX,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor({...range, overscan: renderOverscan});
      return [...new Set([...resizePinnedIndexesRef.current, ...indexes, ...(activeRowIndex < 0 ? [] : [activeRowIndex])])].sort((a, b) => a - b);
    },
    scrollEndThreshold: 80,
    scrollToFn: (offset, options, instance) => {
      if (virtualContentRef.current) virtualContentRef.current.style.height = `${instance.getTotalSize()}px`;
      elementScroll(offset, options, instance);
    },
  });

  const originalResizeItemRef = useRef<TimelineVirtualizer["resizeItem"] | null>(null);
  if (!originalResizeItemRef.current) {
    originalResizeItemRef.current = virtualizer.resizeItem;
    virtualizer.resizeItem = (index, size) => {
      const item = virtualizer.measurementsCache[index];
      const previous = item ? (virtualizer.itemSizeCache.get(item.key) ?? item.size) : undefined;
      const root = scrollRootRef.current;

      if (root && previous !== undefined && Math.abs(size - previous) > root.clientHeight) {
        const view = root.getBoundingClientRect();
        resizePinnedIndexesRef.current = [...root.querySelectorAll<HTMLElement>("[data-index]")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.bottom > view.top && rect.top < view.bottom;
          })
          .map((element) => Number(element.dataset.index));

        if (resizePinFrameRef.current !== null) window.cancelAnimationFrame(resizePinFrameRef.current);
        resizePinFrameRef.current = window.requestAnimationFrame(() => {
          resizePinFrameRef.current = window.requestAnimationFrame(() => {
            resizePinFrameRef.current = null;
            resizePinnedIndexesRef.current = [];
          });
        });
      }

      originalResizeItemRef.current?.(index, size);
    };
  }
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => item.end <= instance.getLogicalScrollOffset();

  const scheduleScrollState = useCallback((element: HTMLElement): void => {
    scrollStateTargetRef.current = element;
    if (scrollStateFrameRef.current !== null) return;

    scrollStateFrameRef.current = window.requestAnimationFrame(() => {
      scrollStateFrameRef.current = null;
      const target = scrollStateTargetRef.current;
      scrollStateTargetRef.current = null;
      if (!target) return;

      const next = scrollStateFor(target);
      setScrollState((current) => (sameScrollState(current, next) ? current : next));
    });
  }, []);

  const setUserScrolled = useCallback((next: boolean): void => {
    if (userScrolledRef.current === next) return;
    userScrolledRef.current = next;
    setUserScrolledState(next);
  }, []);

  const scrollToEnd = useCallback(
    (behavior: ScrollBehavior = "auto"): void => {
      scrollGestureRef.current = 0;
      scrollbarGestureRef.current = false;
      setUserScrolled(false);
      virtualizer.scrollToEnd({behavior});
      const root = scrollRootRef.current;
      if (root) scheduleScrollState(root);
    },
    [scheduleScrollState, setUserScrolled, virtualizer]
  );

  const settleAtEnd = useCallback(
    (frames = SHORT_SCROLL_SETTLE_FRAMES): void => {
      if (settleFrameRef.current !== null) window.cancelAnimationFrame(settleFrameRef.current);

      let remaining = frames;
      const tick = (): void => {
        settleFrameRef.current = null;
        if (latestRowsLengthRef.current === 0 || userScrolledRef.current) return;

        virtualizer.scrollToEnd();
        const root = scrollRootRef.current;
        if (root) scheduleScrollState(root);

        remaining -= 1;
        if (remaining <= 0) return;
        settleFrameRef.current = window.requestAnimationFrame(tick);
      };

      settleFrameRef.current = window.requestAnimationFrame(tick);
    },
    [scheduleScrollState, virtualizer]
  );

  const handleScrollRoot = useCallback(
    (element: HTMLDivElement | null): void => {
      scrollRootRef.current = element;
      if (!element) return;

      lastScrollTopRef.current = element.scrollTop;
      scheduleScrollState(element);
      if (!userScrolledRef.current) settleAtEnd();
    },
    [scheduleScrollState, settleAtEnd]
  );

  const handleWheel = (event: WheelEvent<HTMLDivElement>): void => {
    const root = event.currentTarget;
    const delta = normalizeWheelDelta({deltaMode: event.deltaMode, deltaY: event.deltaY, rootHeight: root.clientHeight});
    if (!delta) return;

    const target = boundaryTarget(root, event.target);
    const nestedCanConsumeGesture =
      target !== root &&
      !shouldMarkBoundaryGesture({
        clientHeight: target.clientHeight,
        delta,
        scrollHeight: target.scrollHeight,
        scrollTop: target.scrollTop,
      });

    if (nestedCanConsumeGesture) {
      scrollGestureRef.current = 0;
      return;
    }
    if (delta > 0 && !userScrolledRef.current) {
      virtualizer.scrollToEnd();
      return;
    }

    scrollGestureRef.current = Date.now();
    if (delta < 0 && target === root) {
      setUserScrolled(true);
      setScrollState({bottom: false, jump: true, overflow: root.scrollHeight - root.clientHeight > 1});
      window.requestAnimationFrame(() => scheduleScrollState(root));
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    scrollbarGestureRef.current = true;
    scrollGestureRef.current = Date.now();
  };

  const handlePointerEnd = (): void => {
    scrollbarGestureRef.current = false;
  };

  const handleClick = (): void => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) setUserScrolled(true);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget;
    const next = scrollStateFor(element);
    const previousScrollTop = lastScrollTopRef.current;
    lastScrollTopRef.current = element.scrollTop;
    scheduleScrollState(element);

    if (next.bottom) {
      setUserScrolled(false);
      return;
    }

    if (element.scrollTop < previousScrollTop - 1 || scrollbarGestureRef.current || Date.now() - scrollGestureRef.current < SCROLL_GESTURE_WINDOW_MS) {
      setUserScrolled(true);
    }
  };

  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    if (!hasTimelineContent) return;

    let secondFrame: number | null = null;
    let firstFrame: number | null = window.requestAnimationFrame(() => {
      if (!userScrolledRef.current) virtualizer.scrollToEnd();
      firstFrame = null;

      secondFrame = window.requestAnimationFrame(() => {
        secondFrame = null;
        if (renderOverscan < 20) setRenderOverscan(20);
        if (!userScrolledRef.current) virtualizer.scrollToEnd();
      });
    });

    return () => {
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [hasTimelineContent, renderOverscan, virtualizer]);

  useLayoutEffect(() => {
    const previousActiveTurnId = previousActiveTurnIdRef.current;
    if (previousActiveTurnId === activeTurnId) return;

    previousActiveTurnIdRef.current = activeTurnId;
    if (!activeTurnId) return;

    scrollToEnd();
    settleAtEnd();
  }, [activeTurnId, scrollToEnd, settleAtEnd]);

  useLayoutEffect(() => {
    const previous = forceFollowSnapshotRef.current;
    const forceStarted = forceFollow && !previous.forceFollow;
    const timelineChanged = previous.rowKeysSignature !== rowKeysSignature || previous.activeContentVersion !== activeContentVersion;

    if (forceStarted) pendingForceFollowRef.current = true;
    if (timelineChanged && pendingForceFollowRef.current && timelineRows.length > 0) {
      scrollToEnd();
      settleAtEnd(12);
      if (!forceFollow) pendingForceFollowRef.current = false;
    }
    if (!forceFollow && !timelineChanged && previous.forceFollow) pendingForceFollowRef.current = false;

    forceFollowSnapshotRef.current = {activeContentVersion, forceFollow, rowKeysSignature};
  }, [activeContentVersion, forceFollow, rowKeysSignature, scrollToEnd, settleAtEnd, timelineRows.length]);

  useLayoutEffect(
    () => () => {
      if (scrollStateFrameRef.current !== null) window.cancelAnimationFrame(scrollStateFrameRef.current);
      if (resizePinFrameRef.current !== null) window.cancelAnimationFrame(resizePinFrameRef.current);
      if (settleFrameRef.current !== null) window.cancelAnimationFrame(settleFrameRef.current);

      if (latestRowsLengthRef.current > 0) {
        timelineCache.delete(latestSessionIdRef.current);
        timelineCache.set(latestSessionIdRef.current, {measurements: virtualizer.takeSnapshot()});
        while (timelineCache.size > TIMELINE_CACHE_LIMIT) timelineCache.delete(timelineCache.keys().next().value!);
      }
    },
    [virtualizer]
  );

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {!hasTimelineContent && (
        <div className="flex min-h-full items-center justify-center px-5 pb-8 pt-6 md:px-8">
          <p className="text-center text-sm text-neutral-600">No messages yet.</p>
        </div>
      )}
      {hasTimelineContent && (
        <div
          aria-label="Session timeline"
          className="h-full overflow-x-hidden overflow-y-auto overscroll-y-contain"
          onClick={handleClick}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onScroll={handleScroll}
          onWheelCapture={handleWheel}
          ref={handleScrollRoot}
        >
          <div
            data-timeline-virtual-content
            ref={virtualContentRef}
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const item = rowByKey.get(String(virtualItem.key));
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
            {timelineRows.length > 0 && (
              <div
                aria-hidden="true"
                className="absolute left-0 top-0 h-6 w-full"
                data-timeline-row="bottom-spacer"
                style={{transform: `translateY(${virtualizer.getTotalSize() - TIMELINE_BOTTOM_PADDING_PX}px)`}}
              />
            )}
          </div>
        </div>
      )}
      {userScrolled && scrollState.overflow && scrollState.jump && (
        <IconButton
          className="absolute bottom-4 left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-[#181818] text-white ring-1 ring-neutral-700 transition hover:bg-[#202020]"
          label="Scroll to latest message"
          onClick={() => scrollToEnd()}
          size="none"
          variant="bare"
        >
          <Icon name="arrow-down" size="sm" />
        </IconButton>
      )}
    </div>
  );
}
