import {LegendList, type LegendListRef} from "@legendapp/list/react";
import {useCallback, useRef, useState} from "react";
import type {ReactNode, RefObject, WheelEvent} from "react";
import {flushSync} from "react-dom";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SessionTimelineFooter from "@/features/sessions/components/timeline/session-timeline-footer";
import SessionTimelineItemFrame from "@/features/sessions/components/timeline/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/session-timeline-row";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

type AutoFollowState = "following" | "leaving" | "detached";

const SCROLL_END_THRESHOLD_PX = 2;
const SCROLL_DIRECTION_THRESHOLD_PX = 1;

function distanceFromEnd(scroller: HTMLElement): number {
  return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
}

function hasScrollableOverflow(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.clientHeight > SCROLL_DIRECTION_THRESHOLD_PX;
}

function isScrollerAtEnd(scroller: HTMLElement): boolean {
  return distanceFromEnd(scroller) <= SCROLL_END_THRESHOLD_PX;
}

interface SessionTimelineProps {
  readonly compacting: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly listRef?: RefObject<LegendListRef | null>;
  readonly liveItems: readonly SessionTimelineItem[];
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {compacting, isStreaming, items, listRef, liveItems, onRevertToMessage, streamError} = props;

  const [autoFollowState, setAutoFollowState] = useState<AutoFollowState>("following");

  const maintainScrollAtEnd = autoFollowState === "following";
  const showScrollToEndButton = autoFollowState !== "following";
  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  const firstLiveItem = liveItems[0];

  const liveTailTurnId = firstLiveItem?.turnId ?? null;
  const autoFollowStateRef = useRef<AutoFollowState>("following");
  const liveTailRef = useRef<{observer: ResizeObserver | null; turnId: string | null}>({observer: null, turnId: null});
  const scrollTopRef = useRef<number | null>(null);

  const setAutoFollow = useCallback((nextState: AutoFollowState | ((current: AutoFollowState) => AutoFollowState)): void => {
    const resolvedState = typeof nextState === "function" ? nextState(autoFollowStateRef.current) : nextState;
    if (resolvedState === autoFollowStateRef.current) return;

    autoFollowStateRef.current = resolvedState;
    setAutoFollowState(resolvedState);
  }, []);

  const scrollToEnd = useCallback(
    (force = false): void => {
      if (!force && autoFollowStateRef.current !== "following") return;

      const list = listRef?.current;
      if (!list) return;

      void list.scrollToEnd({animated: false});
      const scroller = list.getScrollableNode();
      if (!scroller) return;

      scroller.scrollTop = scroller.scrollHeight;
      scrollTopRef.current = scroller.scrollTop;
    },
    [listRef]
  );

  const handleScroll = (): void => {
    const state = listRef?.current?.getState();
    const scroller = listRef?.current?.getScrollableNode();
    if (!state || !scroller) return;

    const previousScrollTop = scrollTopRef.current ?? scroller.scrollTop;
    const scrollingUp = scroller.scrollTop < previousScrollTop - SCROLL_DIRECTION_THRESHOLD_PX;
    scrollTopRef.current = scroller.scrollTop;

    if (!hasScrollableOverflow(scroller)) {
      setAutoFollow("following");
      return;
    }

    if (isScrollerAtEnd(scroller)) {
      setAutoFollow((current) => (current === "leaving" ? "leaving" : "following"));
      return;
    }

    setAutoFollow((current) => {
      if (current === "leaving") return "detached";
      if (current === "following" && scrollingUp) return "detached";
      return current;
    });
  };

  const handleWheelCapture = (event: WheelEvent<HTMLDivElement>): void => {
    const scroller = listRef?.current?.getScrollableNode();
    if (!scroller || !hasScrollableOverflow(scroller)) return;

    if (event.deltaY >= 0 || autoFollowStateRef.current !== "following") return;

    flushSync(() => {
      setAutoFollow("leaving");
    });
  };

  const handleScrollToEndClick = (): void => {
    setAutoFollow("following");
    scrollToEnd(true);
    window.requestAnimationFrame(() => scrollToEnd(true));
  };

  const handleLiveTailRef = useCallback(
    (element: HTMLDivElement | null): void => {
      liveTailRef.current.observer?.disconnect();
      liveTailRef.current.observer = null;

      if (!element) return;

      if (liveTailTurnId !== liveTailRef.current.turnId) {
        liveTailRef.current.turnId = liveTailTurnId;
        if (liveTailTurnId !== null) {
          setAutoFollow("following");
          scrollToEnd(true);
          window.requestAnimationFrame(() => scrollToEnd(true));
        }
      }

      const observer = new ResizeObserver(() => scrollToEnd());
      observer.observe(element);
      liveTailRef.current.observer = observer;

      scrollToEnd();
    },
    [liveTailTurnId, scrollToEnd, setAutoFollow]
  );

  const renderItem = useCallback(
    (renderProps: {item: SessionTimelineItem}): ReactNode => (
      <SessionTimelineItemFrame item={renderProps.item}>
        <SessionTimelineRow item={renderProps.item} onRevertToMessage={onRevertToMessage} />
      </SessionTimelineItemFrame>
    ),
    [onRevertToMessage]
  );

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {!hasTimelineContent && (
        <div className="flex min-h-full items-center justify-center px-5 pb-8 pt-6 md:px-8">
          <p className="text-center text-sm text-neutral-600">No messages yet.</p>
        </div>
      )}
      {hasTimelineContent && (
        <LegendList<SessionTimelineItem>
          className="h-full overflow-x-hidden overscroll-y-contain"
          contentContainerStyle={{paddingTop: 24}}
          data={items}
          estimatedItemSize={140}
          initialScrollAtEnd
          keyExtractor={(item) => item.id}
          ListFooterComponent={
            <div ref={handleLiveTailRef}>
              <SessionTimelineFooter compacting={compacting} isStreaming={isStreaming} liveItems={liveItems} streamError={streamError} />
            </div>
          }
          maintainScrollAtEnd={maintainScrollAtEnd && {animated: false, on: {dataChange: true, itemLayout: true}}}
          maintainScrollAtEndThreshold={0.1}
          maintainVisibleContentPosition
          onScroll={handleScroll}
          onWheelCapture={handleWheelCapture}
          ref={listRef}
          renderItem={renderItem}
        />
      )}
      {showScrollToEndButton && (
        <IconButton
          className="absolute bottom-4 left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-[#181818] text-white ring-1 ring-neutral-700 transition hover:bg-[#202020]"
          label="Scroll to latest message"
          onClick={handleScrollToEndClick}
          size="none"
          variant="bare"
        >
          <Icon name="arrow-down" size="sm" />
        </IconButton>
      )}
    </div>
  );
}
