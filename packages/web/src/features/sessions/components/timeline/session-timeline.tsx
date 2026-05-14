import {LegendList, type LegendListRef} from "@legendapp/list/react";
import {useCallback, useRef, useState} from "react";
import type {ReactNode, RefObject, WheelEvent} from "react";
import {flushSync} from "react-dom";
import SessionTimelineFooter from "@/features/sessions/components/timeline/session-timeline-footer";
import SessionTimelineItemFrame from "@/features/sessions/components/timeline/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/session-timeline-row";
import {getSessionTimelineItemKey} from "@/features/sessions/lib/session-timeline/session-timeline-keys";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

type AutoFollowState = "following" | "detaching" | "detached";

function nextAutoFollowState(current: AutoFollowState, isAtEnd: boolean): AutoFollowState {
  if (current === "detaching") return isAtEnd ? "detaching" : "detached";
  if (current === "detached") return isAtEnd ? "following" : "detached";
  return "following";
}

interface SessionTimelineProps {
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly listRef?: RefObject<LegendListRef | null>;
  readonly liveItems: readonly SessionTimelineItem[];
  readonly streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {isStreaming, items, listRef, liveItems, streamError} = props;

  const [autoFollowState, setAutoFollowState] = useState<AutoFollowState>("following");

  const maintainScrollAtEnd = autoFollowState === "following";
  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  const firstLiveItem = liveItems[0];

  const liveTailTurnId = firstLiveItem?.turnId ?? null;
  const liveTailRef = useRef<{observer: ResizeObserver | null; turnId: string | null}>({observer: null, turnId: null});

  const scrollToEnd = useCallback(
    (force = false): void => {
      if (!force && !maintainScrollAtEnd) return;

      const scroller = listRef?.current?.getScrollableNode();
      if (!scroller) return;

      scroller.scrollTop = scroller.scrollHeight;
    },
    [listRef, maintainScrollAtEnd]
  );

  const handleScroll = (): void => {
    const state = listRef?.current?.getState();
    if (!state) return;

    setAutoFollowState((current) => nextAutoFollowState(current, state.isAtEnd));
  };

  const handleWheelCapture = (event: WheelEvent<HTMLDivElement>): void => {
    if (event.deltaY >= 0) return;

    flushSync(() => {
      setAutoFollowState("detaching");
    });
  };

  const handleLiveTailRef = useCallback(
    (element: HTMLDivElement | null): void => {
      liveTailRef.current.observer?.disconnect();
      liveTailRef.current.observer = null;

      if (!element) return;

      if (liveTailTurnId !== liveTailRef.current.turnId) {
        liveTailRef.current.turnId = liveTailTurnId;
        if (liveTailTurnId !== null) {
          setAutoFollowState("following");
          scrollToEnd(true);
          window.requestAnimationFrame(() => scrollToEnd(true));
        }
      }

      const observer = new ResizeObserver(() => scrollToEnd());
      observer.observe(element);
      liveTailRef.current.observer = observer;

      scrollToEnd();
    },
    [liveTailTurnId, scrollToEnd]
  );

  const renderItem = useCallback(
    (renderProps: {item: SessionTimelineItem}): ReactNode => (
      <SessionTimelineItemFrame item={renderProps.item}>
        <SessionTimelineRow item={renderProps.item} />
      </SessionTimelineItemFrame>
    ),
    []
  );

  return (
    <div className="min-h-0 flex-1 select-text">
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
          keyExtractor={getSessionTimelineItemKey}
          ListFooterComponent={
            <div ref={handleLiveTailRef}>
              <SessionTimelineFooter isStreaming={isStreaming} liveItems={liveItems} streamError={streamError} />
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
    </div>
  );
}
