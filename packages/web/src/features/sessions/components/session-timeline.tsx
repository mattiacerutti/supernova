import {useVirtualizer} from "@tanstack/react-virtual";
import type {IAgentSessionTurnEvent, IAgentSessionUserMessage} from "@pi-desktop/contracts/sessions";
import type {RefObject} from "react";
import {memo, useState} from "react";
import Icon from "@/components/ui/icon";
import AssistantMessage from "@/features/sessions/components/messages/assistant-message";
import StreamingAssistantMessage from "@/features/sessions/components/messages/streaming-assistant-message";
import UserMessageContent from "@/features/sessions/components/messages/user-message";
import {eventError, formatDuration, getWorkIconName} from "@/features/sessions/lib/session-render-items";
import type {SessionRenderItem} from "@/features/sessions/types/session-render-item";
import {cn} from "@/lib/cn";

const UserMessage = memo(function UserMessage(props: {message: IAgentSessionUserMessage}) {
  const {message} = props;

  return (
    <article className="flex justify-end">
      <div className="max-w-lg rounded-xl bg-neutral-800 px-3 py-1.5 text-sm leading-relaxed text-neutral-100">
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
      <section className="space-y-5">
        {item.events.map((event) => (
          <WorkEvent event={event} key={event.id} live={true} />
        ))}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <button
        className="group flex cursor-pointer select-none items-center gap-1.5 text-sm text-neutral-500 transition hover:text-neutral-300"
        onClick={handleToggle}
        type="button"
      >
        <span>Worked for {formatDuration(item.durationMs)}</span>
        <Icon className={cn("transition-transform duration-160 ease-out", showExpanded && "rotate-180")} name="chevron-down" size="xs" />
      </button>
      <div className="h-px bg-white/7" />
      <div
        className="grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-120 ease-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
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
  scrollRef: RefObject<HTMLDivElement | null>;
  streamError: string | null;
}

export default function SessionTimeline(props: ISessionTimelineProps) {
  const {isStreaming, items, scrollRef, streamError} = props;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual manages measurement callbacks internally.
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => 140,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="mt-10 min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
      <div className={cn("mx-auto min-h-full max-w-3xl select-text px-5 pb-8 pt-6 md:px-8", items.length === 0 && "flex items-center justify-center")}>
        {items.length === 0 && <p className="text-center text-sm text-neutral-600">No messages yet.</p>}
        {items.length > 0 && (
          <div className="relative w-full" style={{height: virtualizer.getTotalSize()}}>
            {virtualItems.map((virtualItem) => {
              const item = items[virtualItem.index];
              if (!item) return null;
              return (
                <div
                  className="absolute left-0 top-0 w-full pb-8"
                  data-index={virtualItem.index}
                  key={`${virtualItem.index}:${item.type === "user" ? item.message.id : item.type === "assistant" ? item.event.id : item.id}`}
                  ref={virtualizer.measureElement}
                  style={{transform: `translateY(${virtualItem.start}px)`}}
                >
                  <SessionTimelineRow item={item} live={item.type === "assistant" && item.live} />
                </div>
              );
            })}
          </div>
        )}
        {isStreaming && <div className="size-2 animate-pulse rounded-full bg-neutral-500" />}
        {streamError && <p className="rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-xs text-red-300">{streamError}</p>}
      </div>
    </div>
  );
}
