import type {LegendListRef, MaintainScrollAtEndOptions} from "@legendapp/list/react";
import {useCallback, useLayoutEffect, useRef, useState} from "react";
import type {RefCallback, RefObject, WheelEvent} from "react";
import {flushSync} from "react-dom";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

type AutoFollowState = "following" | "leaving" | "detached";

const MAINTAIN_SCROLL_AT_END_OPTIONS = {
  animated: false,
  on: {dataChange: true, itemLayout: true},
} satisfies MaintainScrollAtEndOptions;
const CHECKPOINT_SCROLL_SETTLE_MIN_DURATION_MS = 750;
const FORCE_SCROLL_SETTLE_STABLE_FRAMES = 4;
const FORCE_SCROLL_SETTLE_TIMEOUT_MS = 2_000;
const SCROLL_END_THRESHOLD_PX = 2;
const SCROLL_DIRECTION_THRESHOLD_PX = 1;
const SHORT_SCROLL_SETTLE_MIN_DURATION_MS = 80;

function distanceFromEnd(scroller: HTMLElement): number {
  return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
}

function hasScrollableOverflow(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.clientHeight > SCROLL_DIRECTION_THRESHOLD_PX;
}

/** Scrolls both Legend List and the backing DOM scroller to the exact tail. */
function scrollListToEnd(list: LegendListRef): number {
  void list.scrollToEnd({animated: false});

  const scroller = list.getScrollableNode();
  scroller.scrollTop = scroller.scrollHeight;
  return scroller.scrollTop;
}

interface UseSessionTimelineAutoScrollInput {
  readonly forceFollow: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly liveTailTurnId: string | null;
}

interface UseSessionTimelineAutoScrollResult {
  readonly listRef: RefObject<LegendListRef | null>;
  readonly liveTailRef: RefCallback<HTMLDivElement>;
  readonly maintainScrollAtEnd: false | MaintainScrollAtEndOptions;
  readonly onScroll: () => void;
  readonly onWheelCapture: (event: WheelEvent<HTMLDivElement>) => void;
  readonly scrollToLatest: () => void;
  readonly showScrollToEndButton: boolean;
}

/** Owns the session timeline's Legend List auto-follow behavior and scroll escape hatch. */
export function useSessionTimelineAutoScroll(input: UseSessionTimelineAutoScrollInput): UseSessionTimelineAutoScrollResult {
  const {forceFollow, items, liveItems, liveTailTurnId} = input;

  const [autoFollowState, setAutoFollowState] = useState<AutoFollowState>("following");
  const autoFollowStateRef = useRef<AutoFollowState>("following");
  const listRef = useRef<LegendListRef | null>(null);
  const pendingForceFollowRef = useRef(false);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const previousItemsRef = useRef<readonly SessionTimelineItem[] | null>(null);
  const previousLiveItemsRef = useRef<readonly SessionTimelineItem[] | null>(null);
  const previousLiveTailTurnIdRef = useRef<string | null>(null);
  const programmaticScrollTokenRef = useRef(0);
  const scrollTopRef = useRef<number | null>(null);

  const setAutoFollow = useCallback((nextState: AutoFollowState | ((current: AutoFollowState) => AutoFollowState)): void => {
    const resolvedState = typeof nextState === "function" ? nextState(autoFollowStateRef.current) : nextState;
    if (resolvedState === autoFollowStateRef.current) return;

    autoFollowStateRef.current = resolvedState;
    setAutoFollowState(resolvedState);
  }, []);

  const scrollToEnd = useCallback((force = false): void => {
    if (!force && autoFollowStateRef.current !== "following") return;

    const list = listRef.current;
    if (!list) return;

    scrollTopRef.current = scrollListToEnd(list);
  }, []);

  /** Keeps retrying imperative tail scrolls while Legend List settles large timeline layout changes. */
  const forceScrollToEnd = useCallback(
    (minimumDurationMs = SHORT_SCROLL_SETTLE_MIN_DURATION_MS): void => {
      const scrollToken = programmaticScrollTokenRef.current + 1;
      const startedAt = performance.now();
      let previousClientHeight = -1;
      let previousScrollHeight = -1;
      let stableFrameCount = 0;

      if (programmaticScrollFrameRef.current !== null) window.cancelAnimationFrame(programmaticScrollFrameRef.current);

      programmaticScrollFrameRef.current = null;
      programmaticScrollTokenRef.current = scrollToken;
      setAutoFollow("following");

      const tick = (): void => {
        const list = listRef.current;
        if (!list || programmaticScrollTokenRef.current !== scrollToken) return;

        const scroller = list.getScrollableNode();
        scrollTopRef.current = scrollListToEnd(list);

        const elapsedMs = performance.now() - startedAt;
        const layoutStable = scroller.clientHeight === previousClientHeight && scroller.scrollHeight === previousScrollHeight;
        const atEnd = distanceFromEnd(scroller) <= SCROLL_END_THRESHOLD_PX;
        stableFrameCount = atEnd && layoutStable ? stableFrameCount + 1 : 0;
        previousClientHeight = scroller.clientHeight;
        previousScrollHeight = scroller.scrollHeight;

        if ((elapsedMs >= minimumDurationMs && stableFrameCount >= FORCE_SCROLL_SETTLE_STABLE_FRAMES) || elapsedMs >= FORCE_SCROLL_SETTLE_TIMEOUT_MS) {
          if (programmaticScrollTokenRef.current === scrollToken) programmaticScrollTokenRef.current = 0;
          programmaticScrollFrameRef.current = null;
          return;
        }

        programmaticScrollFrameRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    },
    [setAutoFollow]
  );

  useLayoutEffect(() => {
    const timelineChanged = previousItemsRef.current !== items || previousLiveItemsRef.current !== liveItems;
    previousItemsRef.current = items;
    previousLiveItemsRef.current = liveItems;

    if (forceFollow && !pendingForceFollowRef.current) {
      pendingForceFollowRef.current = true;
      forceScrollToEnd(CHECKPOINT_SCROLL_SETTLE_MIN_DURATION_MS);
      return;
    }

    if (timelineChanged && pendingForceFollowRef.current) {
      forceScrollToEnd(CHECKPOINT_SCROLL_SETTLE_MIN_DURATION_MS);
      if (!forceFollow) pendingForceFollowRef.current = false;
      return;
    }

    if (!forceFollow) pendingForceFollowRef.current = false;
    if (!timelineChanged || autoFollowStateRef.current !== "following") return;

    const frame = window.requestAnimationFrame(() => scrollToEnd());
    return () => window.cancelAnimationFrame(frame);
  }, [forceFollow, forceScrollToEnd, items, liveItems, scrollToEnd]);

  useLayoutEffect(() => {
    if (liveTailTurnId === previousLiveTailTurnIdRef.current) return;

    previousLiveTailTurnIdRef.current = liveTailTurnId;
    if (liveTailTurnId !== null) forceScrollToEnd();
  }, [forceScrollToEnd, liveTailTurnId]);

  useLayoutEffect(
    () => () => {
      if (programmaticScrollFrameRef.current !== null) window.cancelAnimationFrame(programmaticScrollFrameRef.current);
      programmaticScrollFrameRef.current = null;
      programmaticScrollTokenRef.current = 0;
    },
    []
  );

  const handleScroll = useCallback((): void => {
    const scroller = listRef.current?.getScrollableNode();
    if (!scroller) return;

    const previousScrollTop = scrollTopRef.current ?? scroller.scrollTop;
    const scrollingUp = scroller.scrollTop < previousScrollTop - SCROLL_DIRECTION_THRESHOLD_PX;
    scrollTopRef.current = scroller.scrollTop;

    if (programmaticScrollTokenRef.current !== 0 || pendingForceFollowRef.current) {
      setAutoFollow("following");
      return;
    }

    if (!hasScrollableOverflow(scroller)) {
      setAutoFollow("following");
      return;
    }

    if (distanceFromEnd(scroller) <= SCROLL_END_THRESHOLD_PX) {
      setAutoFollow((current) => (current === "leaving" ? "leaving" : "following"));
      return;
    }

    setAutoFollow((current) => {
      if (current === "leaving") return "detached";
      if (current === "following" && scrollingUp) return "detached";
      return current;
    });
  }, [setAutoFollow]);

  const handleWheelCapture = useCallback(
    (event: WheelEvent<HTMLDivElement>): void => {
      const scroller = listRef.current?.getScrollableNode();
      if (!scroller || !hasScrollableOverflow(scroller)) return;

      if (event.deltaY >= 0 || autoFollowStateRef.current !== "following") return;

      if (programmaticScrollFrameRef.current !== null) window.cancelAnimationFrame(programmaticScrollFrameRef.current);
      programmaticScrollFrameRef.current = null;
      programmaticScrollTokenRef.current = 0;

      // Commit before the browser applies the wheel scroll so Legend List stops pinning the tail.
      flushSync(() => {
        setAutoFollow("leaving");
      });
    },
    [setAutoFollow]
  );

  const handleLiveTailRef = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      if (!element) return;

      const observer = new ResizeObserver(() => scrollToEnd());
      observer.observe(element);
      scrollToEnd();

      return () => observer.disconnect();
    },
    [scrollToEnd]
  );

  return {
    listRef,
    liveTailRef: handleLiveTailRef,
    maintainScrollAtEnd: autoFollowState === "following" ? MAINTAIN_SCROLL_AT_END_OPTIONS : false,
    onScroll: handleScroll,
    onWheelCapture: handleWheelCapture,
    scrollToLatest: () => forceScrollToEnd(CHECKPOINT_SCROLL_SETTLE_MIN_DURATION_MS),
    showScrollToEndButton: autoFollowState !== "following",
  };
}
