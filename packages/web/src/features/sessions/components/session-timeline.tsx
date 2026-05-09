import {LegendList, type LegendListRef} from "@legendapp/list/react";
import type {IAgentSessionTurnEvent, IAgentSessionUserMessage} from "@pi-desktop/contracts/sessions";
import {memo, useCallback, useState} from "react";
import {flushSync} from "react-dom";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import AssistantMessage from "@/features/sessions/components/messages/assistant-message";
import StreamingAssistantMessage from "@/features/sessions/components/messages/streaming-assistant-message";
import UserMessageContent from "@/features/sessions/components/messages/user-message";
import {eventError, formatDuration, getWorkIconName} from "@/features/sessions/lib/session-render-items";
import type {SessionRenderItem} from "@/features/sessions/types/session-render-item";
import {cn} from "@/lib/cn";

type AutoFollowState = "following" | "detaching" | "detached";

function nextAutoFollowState(current: AutoFollowState, isAtEnd: boolean): AutoFollowState {
  if (current === "detaching") return isAtEnd ? "detaching" : "detached";
  if (current === "detached") return isAtEnd ? "following" : "detached";
  return "following";
}

const UserMessage = memo(function UserMessage(props: {message: IAgentSessionUserMessage}) {
  const {message} = props;

  return (
    <article className="flex justify-end">
      <div className="max-w-lg rounded-2xl corner-superellipse/1.3 bg-neutral-800 px-3.5 py-2 text-sm leading-relaxed text-neutral-200">
        <UserMessageContent>{message.content}</UserMessageContent>
      </div>
    </article>
  );
});

const AssistantEvent = memo(function AssistantEvent(props: {event: Extract<IAgentSessionTurnEvent, {type: "assistant"}>; live: boolean}) {
  const {event, live} = props;
  const error = eventError(event);

  return (
    <article>
      <div className="max-w-3xl">
        {event.content.length > 0 && (live ? <StreamingAssistantMessage>{event.content}</StreamingAssistantMessage> : <AssistantMessage>{event.content}</AssistantMessage>)}
        {error && <p className="mt-3 rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      </div>
    </article>
  );
});

const WorkEvent = memo(function WorkEvent(props: {event: IAgentSessionTurnEvent; live: boolean}) {
  const {event, live} = props;

  if (event.type === "tool") {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <Icon name={getWorkIconName(event)} size="sm" />
        <span>{event.tool?.summary ?? "Ran tool"}</span>
      </div>
    );
  }

  if (event.type !== "reasoning" || !event.content) return null;

  return (
    <div className="text-neutral-200">
      {live ? (
        <StreamingAssistantMessage className="text-neutral-300">{event.content}</StreamingAssistantMessage>
      ) : (
        <AssistantMessage className="text-neutral-300">{event.content}</AssistantMessage>
      )}
    </div>
  );
});

const WorkBlock = memo(function WorkBlock(props: {item: Extract<SessionRenderItem, {type: "work"}>}) {
  const {item} = props;
  const [expanded, setExpanded] = useState(false);

  const showExpanded = item.live || expanded;

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
  };

  if (item.live) {
    return (
      <section className="space-y-3">
        {item.events.map((event) => (
          <WorkEvent event={event} key={event.id} live={true} />
        ))}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <Button
        className="group inline-flex w-fit select-none gap-1.5 px-0 py-0 text-sm text-neutral-500 hover:text-neutral-30 items-center 0"
        onClick={handleToggle}
        variant="ghost"
      >
        <span>Worked for {formatDuration(item.durationMs)}</span>
        <Icon className={cn("transition-transform duration-160 ease-out", showExpanded && "rotate-90")} name="chevron-right" size="xs" />
      </Button>
      <div className="h-px bg-white/7" />
      <div
        className="grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-300 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
        data-expanded={showExpanded}
      >
        <div className="space-y-5 overflow-hidden">
          {item.events.map((event) => (
            <WorkEvent event={event} key={event.id} live={false} />
          ))}
        </div>
      </div>
    </section>
  );
});

const SessionTimelineRow = memo(function SessionTimelineRow(props: {item: SessionRenderItem; live: boolean}) {
  const {item, live} = props;

  if (item.type === "user") return <UserMessage message={item.message} />;
  if (item.type === "assistant") return <AssistantEvent event={item.event} live={live} />;
  return <WorkBlock item={item} />;
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

  const handleScroll = useCallback((): void => {
    const state = listRef.current?.getState();
    if (!state) return;

    setAutoFollowState((current) => nextAutoFollowState(current, state.isAtEnd));
  }, [listRef]);

  const handleWheelCapture = useCallback((event: React.WheelEvent<HTMLDivElement>): void => {
    if (event.deltaY >= 0) return;

    flushSync(() => {
      setAutoFollowState("detaching");
    });
  }, []);

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
