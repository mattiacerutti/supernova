import {LegendList, type LegendListRef} from "@legendapp/list/react";
import {memo, useCallback, useState} from "react";
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

interface ISessionTimelineProps {
  items: readonly SessionRenderItem[];
  isStreaming: boolean;
  listRef: React.RefObject<LegendListRef | null>;
  streamError: string | null;
}

export default function SessionTimeline(props: ISessionTimelineProps) {
  const {isStreaming, items, listRef, streamError} = props;
  const [autoFollowState, setAutoFollowState] = useState<AutoFollowState>("following");
  const maintainScrollAtEnd = autoFollowState === "following";

  const handleScroll = (): void => {
    const state = listRef.current?.getState();
    if (!state) return;

    setAutoFollowState((current) => nextAutoFollowState(current, state.isAtEnd));
  };

  const handleWheelCapture = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (event.deltaY >= 0) return;

    flushSync(() => {
      setAutoFollowState("detaching");
    });
  };

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
      {items.length === 0 && !isStreaming && !streamError && (
        <div className="flex min-h-full items-center justify-center px-5 pb-8 pt-6 md:px-8">
          <p className="text-center text-sm text-neutral-600">No messages yet.</p>
        </div>
      )}
      {(items.length > 0 || isStreaming || streamError) && (
        <LegendList<SessionRenderItem>
          className="h-full overflow-x-hidden overscroll-y-contain"
          contentContainerStyle={{paddingTop: 24}}
          data={items}
          estimatedItemSize={140}
          initialScrollAtEnd
          keyExtractor={getSessionRenderItemKey}
          ListFooterComponent={
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
