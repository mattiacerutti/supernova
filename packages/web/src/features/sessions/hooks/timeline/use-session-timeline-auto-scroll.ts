import {useCallback, useLayoutEffect, useRef, useState} from "react";
import type {PointerEvent, RefCallback, RefObject, UIEvent, WheelEvent} from "react";
import type {VirtualizerHandle} from "virtua";
import {useSessionTimelineCache} from "@/features/sessions/hooks/timeline/use-session-timeline-cache";
import type {SessionTimelineCache, SessionTimelineVirtualizerHandle} from "@/features/sessions/hooks/timeline/use-session-timeline-cache";

interface ScrollState {
  readonly bottom: boolean;
  readonly jump: boolean;
  readonly overflow: boolean;
}

const AUTO_SCROLL_MARK_MS = 1_500;
const BOTTOM_ANCHOR_INITIAL_FRAMES = 90;
const BOTTOM_ANCHOR_STREAMING_FRAMES = 12;
const CHECKPOINT_SCROLL_SETTLE_MIN_DURATION_MS = 750;
const FORCE_SCROLL_SETTLE_STABLE_FRAMES = 4;
const FORCE_SCROLL_SETTLE_TIMEOUT_MS = 2_000;
const SCROLL_BOTTOM_THRESHOLD_PX = 10;
const SCROLL_END_THRESHOLD_PX = 2;
const SCROLL_GESTURE_WINDOW_MS = 250;
const SHORT_SCROLL_SETTLE_MIN_DURATION_MS = 80;

const initialScrollState = {bottom: true, jump: false, overflow: false} satisfies ScrollState;

function sameKeys(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((key, index) => key === b[index]);
}

function distanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.clientHeight - element.scrollTop;
}

function hasScrollableOverflow(element: HTMLElement): boolean {
  return element.scrollHeight - element.clientHeight > 1;
}

function isMeasuredBottom(element: HTMLElement): boolean {
  return distanceFromBottom(element) <= 4;
}

function jumpThreshold(element: HTMLElement): number {
  return Math.max(400, element.clientHeight);
}

function scrollStateFor(element: HTMLElement): ScrollState {
  const max = element.scrollHeight - element.clientHeight;
  const distance = max - element.scrollTop;
  const overflow = max > 1;

  return {
    bottom: !overflow || distance <= SCROLL_END_THRESHOLD_PX,
    jump: overflow && distance > jumpThreshold(element),
    overflow,
  };
}

function sameScrollState(a: ScrollState, b: ScrollState): boolean {
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

function updateOverflowAnchor(element: HTMLElement, userScrolled: boolean): void {
  element.style.overflowAnchor = userScrolled ? "auto" : "none";
}

interface UseSessionTimelineAutoScrollInput {
  /** Signature for active streamed content; changes even when row keys do not. */
  readonly activeContentVersion: string;
  /** Running turn id. A new turn should explicitly settle the timeline at the bottom. */
  readonly activeTurnId: string | null;
  /** External bottom-follow request used by checkpoint navigation. */
  readonly forceFollow: boolean;
  /** Whether content is currently streaming and row heights may keep growing. */
  readonly isStreaming: boolean;
  /** Ordered virtual row ids used for cache validity and structural change detection. */
  readonly rowKeys: readonly string[];
  /** Session id used to partition cache and initial bottom anchoring. */
  readonly sessionId: string;
}

interface UseSessionTimelineAutoScrollResult {
  /** Virtua cache for this exact session and row order, if one exists. */
  readonly cache: SessionTimelineCache | undefined;
  /** True once the current session has completed its initial bottom-anchor attempt. */
  readonly initialAnchored: boolean;
  /** Detaches follow mode when text selection should not be interrupted by auto-scroll. */
  readonly onClick: () => void;
  /** Marks direct interaction with the scroll root, including scrollbar drags. */
  readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  /** Reconciles user scroll, programmatic scroll, virtua corrections, and reattachment. */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
  /** Captures wheel intent before the browser applies the scroll delta. */
  readonly onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  /** Current scroll container for virtua, observers, and animation-frame work. */
  readonly scrollRef: RefObject<HTMLElement | null>;
  /** Forces the timeline to the latest content and follows until layout settles. */
  readonly scrollToLatest: () => void;
  /** Installs the scroll root, content observer, and initial anchoring behavior. */
  readonly setScrollRoot: RefCallback<HTMLDivElement>;
  /** Captures virtua's imperative handle for cache and scroll operations. */
  readonly setVirtualizer: RefCallback<VirtualizerHandle>;
  /** Shows the floating affordance only while detached and far enough from the end. */
  readonly showScrollToEndButton: boolean;
}

/** Owns the session timeline's virtua-backed bottom anchoring and user detachment behavior. */
export function useSessionTimelineAutoScroll(input: UseSessionTimelineAutoScrollInput): UseSessionTimelineAutoScrollResult {
  const {activeContentVersion, activeTurnId, forceFollow, isStreaming, rowKeys, sessionId} = input;
  const rowCount = rowKeys.length;
  const rowKeysSignature = rowKeys.join("\u0000");

  const [initialAnchored, setInitialAnchored] = useState(false);
  const [scrollState, setScrollState] = useState<ScrollState>(initialScrollState);
  const [userScrolled, setUserScrolledState] = useState(false);

  const scrollRef = useRef<HTMLElement | null>(null);
  const virtualizerRef = useRef<SessionTimelineVirtualizerHandle | null>(null);

  const activeTurnIdRef = useRef(activeTurnId);
  const autoScrollRef = useRef<{readonly time: number; readonly top: number} | undefined>(undefined);
  const autoScrollTimerRef = useRef<number | null>(null);
  const forceFollowSnapshotRef = useRef({activeContentVersion, forceFollow, rowKeys});
  const bottomAnchorFrameRef = useRef<number | null>(null);
  const bottomAnchorFramesRef = useRef(0);
  const bottomAnchorSessionKeyRef = useRef("");
  const bottomReattachBlockedUntilRef = useRef(0);
  const measuredBottomAnchoredRef = useRef(true);

  const contentFrameRef = useRef<number | null>(null);
  const contentResizeObserverRef = useRef<ResizeObserver | null>(null);

  const scrollGestureRef = useRef(0);
  const userScrolledRef = useRef(false);

  const pendingForceFollowRef = useRef(false);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const programmaticScrollTokenRef = useRef(0);

  const scrollStateFrameRef = useRef<number | null>(null);
  const scrollStateTargetRef = useRef<HTMLElement | null>(null);

  const {cache, setVirtualizer: setCachedVirtualizer} = useSessionTimelineCache({rowKeys, sessionId, virtualizerRef});

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

  const markAutoScroll = useCallback((element: HTMLElement): void => {
    autoScrollRef.current = {
      time: Date.now(),
      top: Math.max(0, element.scrollHeight - element.clientHeight),
    };

    if (autoScrollTimerRef.current !== null) window.clearTimeout(autoScrollTimerRef.current);
    autoScrollTimerRef.current = window.setTimeout(() => {
      autoScrollRef.current = undefined;
      autoScrollTimerRef.current = null;
    }, AUTO_SCROLL_MARK_MS);
  }, []);

  const isAutoScroll = useCallback((element: HTMLElement): boolean => {
    const autoScroll = autoScrollRef.current;
    if (!autoScroll) return false;

    if (Date.now() - autoScroll.time > AUTO_SCROLL_MARK_MS) {
      autoScrollRef.current = undefined;
      return false;
    }

    return Math.abs(element.scrollTop - autoScroll.top) < 2;
  }, []);

  const setUserScrolled = useCallback(
    (next: boolean): void => {
      if (!next) {
        bottomReattachBlockedUntilRef.current = 0;
        scrollGestureRef.current = 0;
      }
      if (userScrolledRef.current === next) return;

      userScrolledRef.current = next;
      setUserScrolledState(next);

      const element = scrollRef.current;
      if (!element) return;

      updateOverflowAnchor(element, next);
      scheduleScrollState(element);
    },
    [scheduleScrollState]
  );

  const markScrollGesture = useCallback((target?: EventTarget | null): void => {
    const root = scrollRef.current;
    if (!root) return;

    const element = target instanceof Element ? target : undefined;
    const nested = element?.closest("[data-scrollable]");
    if (nested && nested !== root) return;

    scrollGestureRef.current = Date.now();
  }, []);

  const cancelBottomAnchor = useCallback((): void => {
    if (bottomAnchorFrameRef.current !== null) window.cancelAnimationFrame(bottomAnchorFrameRef.current);
    bottomAnchorFrameRef.current = null;
    bottomAnchorFramesRef.current = 0;
    measuredBottomAnchoredRef.current = false;
  }, []);

  const cancelProgrammaticScroll = useCallback((): void => {
    if (programmaticScrollFrameRef.current !== null) window.cancelAnimationFrame(programmaticScrollFrameRef.current);
    programmaticScrollFrameRef.current = null;
    programmaticScrollTokenRef.current = 0;
  }, []);

  const scrollToBottomNow = useCallback(
    (targetRowCount: number, measure: boolean): void => {
      const element = scrollRef.current;
      if (!element) return;

      const lastIndex = targetRowCount - 1;
      if (measure) virtualizerRef.current?.measure?.();
      if (lastIndex >= 0) virtualizerRef.current?.scrollToIndex(lastIndex, {align: "end"});

      element.scrollTop = element.scrollHeight;
      markAutoScroll(element);
      measuredBottomAnchoredRef.current = true;
      scheduleScrollState(element);
    },
    [markAutoScroll, scheduleScrollState]
  );

  const scrollToBottom = useCallback(
    (targetRowCount: number, force: boolean, measure = false): void => {
      if (force) setUserScrolled(false);
      if (!force && userScrolledRef.current) return;

      const element = scrollRef.current;
      if (!element) return;

      scrollToBottomNow(targetRowCount, measure);
    },
    [scrollToBottomNow, setUserScrolled]
  );

  const anchorMeasuredBottom = useCallback((): boolean => {
    const element = scrollRef.current;
    if (!element || userScrolledRef.current || !measuredBottomAnchoredRef.current) return false;

    element.scrollTop = element.scrollHeight;
    markAutoScroll(element);
    scheduleScrollState(element);
    return true;
  }, [markAutoScroll, scheduleScrollState]);

  const scheduleMeasuredBottomAnchor = useCallback(
    (frameCount: number): void => {
      if (userScrolledRef.current) return;
      bottomAnchorFramesRef.current = frameCount;
      if (bottomAnchorFrameRef.current !== null) return;

      const tick = (): void => {
        bottomAnchorFrameRef.current = null;
        if (!anchorMeasuredBottom()) {
          bottomAnchorFramesRef.current = 0;
          return;
        }

        bottomAnchorFramesRef.current = isStreaming ? BOTTOM_ANCHOR_STREAMING_FRAMES : bottomAnchorFramesRef.current - 1;
        if (bottomAnchorFramesRef.current <= 0) return;
        bottomAnchorFrameRef.current = window.requestAnimationFrame(tick);
      };

      bottomAnchorFrameRef.current = window.requestAnimationFrame(tick);
    },
    [anchorMeasuredBottom, isStreaming]
  );

  const maybeAnchorBottom = useCallback(
    (targetSessionId: string, targetRowCount: number): void => {
      if (bottomAnchorSessionKeyRef.current === targetSessionId) return;

      if (targetRowCount === 0) {
        setInitialAnchored(true);
        return;
      }
      if (!virtualizerRef.current) return;

      bottomAnchorSessionKeyRef.current = targetSessionId;
      if (!userScrolledRef.current) {
        scrollToBottomNow(targetRowCount, false);
        scheduleMeasuredBottomAnchor(BOTTOM_ANCHOR_INITIAL_FRAMES);
      }
      setInitialAnchored(true);
    },
    [scheduleMeasuredBottomAnchor, scrollToBottomNow]
  );

  // Force-follow keeps pulling to the end until virtua measurements are stable.
  const forceScrollToBottom = useCallback(
    (targetRowCount: number, minimumDurationMs = SHORT_SCROLL_SETTLE_MIN_DURATION_MS): void => {
      const scrollToken = programmaticScrollTokenRef.current + 1;
      const startedAt = performance.now();
      let previousClientHeight = -1;
      let previousScrollHeight = -1;
      let stableFrameCount = 0;

      cancelProgrammaticScroll();
      programmaticScrollTokenRef.current = scrollToken;
      setUserScrolled(false);

      const tick = (): void => {
        const element = scrollRef.current;
        if (!element || programmaticScrollTokenRef.current !== scrollToken) return;

        scrollToBottomNow(targetRowCount, false);

        const elapsedMs = performance.now() - startedAt;
        const layoutStable = element.clientHeight === previousClientHeight && element.scrollHeight === previousScrollHeight;
        const atEnd = distanceFromBottom(element) <= SCROLL_END_THRESHOLD_PX;
        stableFrameCount = atEnd && layoutStable ? stableFrameCount + 1 : 0;
        previousClientHeight = element.clientHeight;
        previousScrollHeight = element.scrollHeight;

        if ((elapsedMs >= minimumDurationMs && stableFrameCount >= FORCE_SCROLL_SETTLE_STABLE_FRAMES) || elapsedMs >= FORCE_SCROLL_SETTLE_TIMEOUT_MS) {
          if (programmaticScrollTokenRef.current === scrollToken) programmaticScrollTokenRef.current = 0;
          programmaticScrollFrameRef.current = null;
          return;
        }

        programmaticScrollFrameRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    },
    [cancelProgrammaticScroll, scrollToBottomNow, setUserScrolled]
  );

  const stopFollowing = useCallback((): void => {
    const element = scrollRef.current;
    if (!element) return;

    cancelBottomAnchor();
    cancelProgrammaticScroll();

    if (!hasScrollableOverflow(element)) {
      setUserScrolled(false);
      return;
    }
    if (userScrolledRef.current) return;

    bottomReattachBlockedUntilRef.current = Date.now() + SCROLL_GESTURE_WINDOW_MS;
    setUserScrolled(true);
  }, [cancelBottomAnchor, cancelProgrammaticScroll, setUserScrolled]);

  const disconnectContentObserver = useCallback((): void => {
    contentResizeObserverRef.current?.disconnect();
    contentResizeObserverRef.current = null;
  }, []);

  // Streaming mostly changes row height, not row identity, so ResizeObserver is the
  // primary follow signal while assistant output grows.
  const bindContentRoot = useCallback(
    (root: HTMLDivElement): void => {
      disconnectContentObserver();

      const child = root.firstElementChild;
      const content = child instanceof HTMLElement ? child : root;
      const observer = new ResizeObserver(() => {
        const element = scrollRef.current;
        if (!element) return;

        scheduleScrollState(element);
        if (!hasScrollableOverflow(element)) {
          setUserScrolled(false);
          return;
        }
        if (userScrolledRef.current) return;

        scrollToBottom(rowCount, false, true);
      });

      observer.observe(content);
      contentResizeObserverRef.current = observer;
    },
    [disconnectContentObserver, rowCount, scheduleScrollState, scrollToBottom, setUserScrolled]
  );

  const setScrollRoot = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      if (contentFrameRef.current !== null) window.cancelAnimationFrame(contentFrameRef.current);
      contentFrameRef.current = null;
      disconnectContentObserver();

      scrollRef.current = element;
      if (!element) return;

      updateOverflowAnchor(element, userScrolledRef.current);
      measuredBottomAnchoredRef.current = isMeasuredBottom(element);
      scheduleScrollState(element);

      contentFrameRef.current = window.requestAnimationFrame(() => {
        contentFrameRef.current = null;
        if (scrollRef.current !== element) return;

        bindContentRoot(element);
        maybeAnchorBottom(sessionId, rowCount);
      });
    },
    [bindContentRoot, disconnectContentObserver, maybeAnchorBottom, rowCount, scheduleScrollState, sessionId]
  );

  const setVirtualizer = useCallback<RefCallback<VirtualizerHandle>>(
    (handle) => {
      setCachedVirtualizer(handle);
      if (handle) maybeAnchorBottom(sessionId, rowCount);
    },
    [maybeAnchorBottom, rowCount, sessionId, setCachedVirtualizer]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>): void => {
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

      if (nestedCanConsumeGesture) return;

      // While attached, downward wheel deltas are not user intent: let auto-follow own the bottom lock.
      if (delta > 0 && !userScrolledRef.current) {
        if (event.cancelable) event.preventDefault();
        scrollToBottom(rowCount, false, true);
        return;
      }

      markScrollGesture(root);

      if (delta > 0) return;
      if (target !== root) return;

      stopFollowing();
    },
    [markScrollGesture, rowCount, scrollToBottom, stopFollowing]
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      if (event.target !== event.currentTarget) return;
      markScrollGesture(event.currentTarget);
    },
    [markScrollGesture]
  );

  const handleClick = useCallback((): void => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) stopFollowing();
  }, [stopFollowing]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>): void => {
      const element = event.currentTarget;
      measuredBottomAnchoredRef.current = isMeasuredBottom(element);
      scheduleScrollState(element);

      if (!hasScrollableOverflow(element)) {
        setUserScrolled(false);
        return;
      }

      const distance = distanceFromBottom(element);
      if (distance < SCROLL_BOTTOM_THRESHOLD_PX) {
        measuredBottomAnchoredRef.current = true;
        if (!userScrolledRef.current || Date.now() >= bottomReattachBlockedUntilRef.current) setUserScrolled(false);
        return;
      }

      if (userScrolledRef.current) {
        if (Date.now() - scrollGestureRef.current < SCROLL_GESTURE_WINDOW_MS) virtualizerRef.current?.scrollTo(element.scrollTop);
        return;
      }

      if (isAutoScroll(element)) {
        scrollToBottom(rowCount, false, true);
        return;
      }

      if (Date.now() - scrollGestureRef.current >= SCROLL_GESTURE_WINDOW_MS) return;

      stopFollowing();
      markScrollGesture(element);
    },
    [isAutoScroll, markScrollGesture, rowCount, scheduleScrollState, scrollToBottom, setUserScrolled, stopFollowing]
  );

  useLayoutEffect(() => {
    if (rowCount === 0) return;
    if (userScrolledRef.current) return;

    scrollToBottom(rowCount, false);
    scheduleMeasuredBottomAnchor(isStreaming ? BOTTOM_ANCHOR_STREAMING_FRAMES : BOTTOM_ANCHOR_INITIAL_FRAMES);
  }, [activeContentVersion, isStreaming, rowCount, rowKeysSignature, scheduleMeasuredBottomAnchor, scrollToBottom]);

  useLayoutEffect(() => {
    const previous = forceFollowSnapshotRef.current;
    const forceStarted = forceFollow && !previous.forceFollow;
    const timelineChanged = !sameKeys(previous.rowKeys, rowKeys) || previous.activeContentVersion !== activeContentVersion;

    if (forceStarted) pendingForceFollowRef.current = true;
    if (timelineChanged && pendingForceFollowRef.current) {
      forceScrollToBottom(rowCount, CHECKPOINT_SCROLL_SETTLE_MIN_DURATION_MS);
      if (!forceFollow) pendingForceFollowRef.current = false;
    }
    if (!forceFollow && !timelineChanged && previous.forceFollow) pendingForceFollowRef.current = false;

    forceFollowSnapshotRef.current = {activeContentVersion, forceFollow, rowKeys};
  }, [activeContentVersion, forceFollow, forceScrollToBottom, rowCount, rowKeys]);

  useLayoutEffect(() => {
    const previousActiveTurnId = activeTurnIdRef.current;
    if (previousActiveTurnId === activeTurnId) return;

    activeTurnIdRef.current = activeTurnId;
    if (activeTurnId && (previousActiveTurnId === null || !userScrolledRef.current)) forceScrollToBottom(rowCount);
  }, [activeTurnId, forceScrollToBottom, rowCount]);

  useLayoutEffect(
    () => () => {
      if (autoScrollTimerRef.current !== null) window.clearTimeout(autoScrollTimerRef.current);
      if (bottomAnchorFrameRef.current !== null) window.cancelAnimationFrame(bottomAnchorFrameRef.current);
      if (contentFrameRef.current !== null) window.cancelAnimationFrame(contentFrameRef.current);
      if (programmaticScrollFrameRef.current !== null) window.cancelAnimationFrame(programmaticScrollFrameRef.current);
      if (scrollStateFrameRef.current !== null) window.cancelAnimationFrame(scrollStateFrameRef.current);

      autoScrollRef.current = undefined;
      autoScrollTimerRef.current = null;
      bottomAnchorFrameRef.current = null;
      contentFrameRef.current = null;
      programmaticScrollFrameRef.current = null;
      programmaticScrollTokenRef.current = 0;
      scrollStateFrameRef.current = null;
      disconnectContentObserver();
    },
    [disconnectContentObserver]
  );

  return {
    cache,
    initialAnchored,
    onClick: handleClick,
    onPointerDown: handlePointerDown,
    onScroll: handleScroll,
    onWheel: handleWheel,
    scrollRef,
    scrollToLatest: () => forceScrollToBottom(rowCount, CHECKPOINT_SCROLL_SETTLE_MIN_DURATION_MS),
    setScrollRoot,
    setVirtualizer,
    showScrollToEndButton: userScrolled && scrollState.overflow,
  };
}
