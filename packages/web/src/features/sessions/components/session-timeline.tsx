import {LegendList, type LegendListRef} from "@legendapp/list/react";
import {memo, useCallback, useRef, useState} from "react";
import {flushSync} from "react-dom";
import AssistantMessage from "@/features/sessions/components/messages/assistant-message";
import UserMessage from "@/features/sessions/components/messages/user-message";
import WorkBlock from "@/features/sessions/components/messages/work-block";
import type {SessionRenderItem} from "@/features/sessions/types/session-render-item";
import {cn} from "@/lib/cn";

type AutoFollowState = "following" | "detaching" | "detached";

function nextAutoFollowState(current: AutoFollowState, isAtEnd: boolean): AutoFollowState {
  if (current === "detaching") return isAtEnd ? "detaching" : "detached";
  if (current === "detached") return isAtEnd ? "following" : "detached";
  return "following";
}

const SessionTimelineRow = memo(function SessionTimelineRow(props: {item: SessionRenderItem; live: boolean}) {
  const {item, live} = props;

  if (item.type === "user") return <UserMessage message={item.message} />;
  if (item.type === "assistant") return <AssistantMessage event={item.event} live={live} />;
  if (item.type === "work") return <WorkBlock item={item} />;
});

interface SessionTimelineProps {
  items: readonly SessionRenderItem[];
  isStreaming: boolean;
  listRef?: React.RefObject<LegendListRef | null>;
  liveItems: readonly SessionRenderItem[];
  streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {isStreaming, items, listRef, liveItems, streamError} = props;

  const [autoFollowState, setAutoFollowState] = useState<AutoFollowState>("following");

  const maintainScrollAtEnd = autoFollowState === "following";
  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;
  const firstLiveItem = liveItems[0];

  const liveTailStartKey = firstLiveItem ? getSessionRenderItemKey(firstLiveItem, 0) : null;
  const liveTailRef = useRef<{observer: ResizeObserver | null; startKey: string | null}>({observer: null, startKey: null});

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

  const handleWheelCapture = (event: React.WheelEvent<HTMLDivElement>): void => {
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

      if (liveTailStartKey !== liveTailRef.current.startKey) {
        liveTailRef.current.startKey = liveTailStartKey;
        if (liveTailStartKey !== null) {
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
    [liveTailStartKey, scrollToEnd]
  );

  const renderItem = useCallback(
    (renderProps: {item: SessionRenderItem}): React.ReactNode => (
      <div className={cn("mx-auto w-full max-w-3xl px-5 md:px-8", renderProps.item.type === "work" ? "pb-4" : "pb-8")}>
        <SessionTimelineRow item={renderProps.item} live={renderProps.item.type === "assistant" && renderProps.item.live} />
      </div>
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
        <LegendList<SessionRenderItem>
          className="h-full overflow-x-hidden overscroll-y-contain"
          contentContainerStyle={{paddingTop: 24}}
          data={items}
          estimatedItemSize={140}
          initialScrollAtEnd
          keyExtractor={getSessionRenderItemKey}
          ListFooterComponent={
            // Keep the active streaming turn out of LegendList's virtualized data.
            // Streaming text changes height token-by-token; if it is a measured
            // virtual row, LegendList first grows the content and then corrects
            // scroll-at-end on a later frame, which makes the footer visibly jump.
            // Rendering the live tail as the list footer keeps committed history
            // virtualized while letting ResizeObserver bottom-lock the streaming
            // content synchronously when auto-follow is active.
            <div ref={handleLiveTailRef}>
              {liveItems.map((item, index) => (
                <div className={cn("mx-auto w-full max-w-3xl px-5 md:px-8", item.type === "work" ? "pb-4" : "pb-8")} key={getSessionRenderItemKey(item, index)}>
                  <SessionTimelineRow item={item} live={item.type === "assistant" && item.live} />
                </div>
              ))}
              <div className="mx-auto w-full max-w-3xl px-5 pb-8 md:px-8">
                {isStreaming && (
                  <div className="relative w-fit text-sm text-neutral-600">
                    <span>Thinking</span>
                    <span aria-hidden="true" className="thinking-shimmer absolute inset-0 text-neutral-200">
                      Thinking
                    </span>
                  </div>
                )}
                {streamError && <p className="rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-xs text-red-300">{streamError}</p>}
              </div>
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

function getSessionRenderItemKey(item: SessionRenderItem, index: number): string {
  if (item.type === "user") return `user:${item.message.id}`;
  if (item.type === "assistant") return `assistant:${item.event.id}`;

  return `work:${index}:${item.id}`;
}
