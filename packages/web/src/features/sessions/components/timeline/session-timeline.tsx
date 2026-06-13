import {Virtualizer} from "virtua";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SessionTimelineVirtualRow from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import type {TimelineVirtualItem} from "@/features/sessions/components/timeline/session-timeline-virtual-row";
import {useSessionTimelineAutoScroll} from "@/features/sessions/hooks/timeline/use-session-timeline-auto-scroll";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

const TIMELINE_FALLBACK_ITEM_SIZE = 60;

function hasPendingToolCall(items: readonly SessionTimelineItem[]): boolean {
  return items.some((item) => item.type === "work" && item.events.some((event) => event.type === "tool" && event.tool?.status === "pending"));
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
  const streamingLabel = compacting ? "Compacting context" : "Thinking";

  if (isStreaming && !hasPendingToolCall(liveItems)) {
    rows.push({id: `streaming-status:${activeTurnId}`, label: streamingLabel, turnId: activeTurnId, type: "streaming-status"});
  }

  if (streamError) rows.push({id: `stream-error:${activeTurnId}`, message: streamError, turnId: activeTurnId, type: "stream-error"});

  rows.push({id: "bottom-spacer", type: "bottom-spacer"});
  return rows;
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
  const rowKeys = timelineRows.map((item) => item.id);
  const activeTurnId = liveItems[0]?.turnId ?? null;

  const activeRowIndex = activeTurnId ? timelineRows.findLastIndex((item) => "turnId" in item && item.turnId === activeTurnId) : -1;
  const activeContentVersion = [isStreaming ? "streaming" : "idle", compacting ? "compacting" : "chat", streamError ?? "", ...liveItems.map(timelineItemContentVersion)].join("|");
  const keepMounted = activeRowIndex >= 0 ? [activeRowIndex] : undefined;

  const {cache, initialAnchored, onClick, onPointerDown, onScroll, onWheel, scrollRef, scrollToLatest, setScrollRoot, setVirtualizer, showScrollToEndButton} =
    useSessionTimelineAutoScroll({
      activeContentVersion,
      activeTurnId,
      forceFollow,
      isStreaming,
      rowKeys,
      sessionId,
    });

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
          className={cn("h-full overflow-x-hidden overscroll-y-contain", !initialAnchored && "opacity-0")}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onScroll={onScroll}
          onWheelCapture={onWheel}
          ref={setScrollRoot}
        >
          <Virtualizer
            cache={cache}
            data={timelineRows}
            itemSize={cache ? undefined : TIMELINE_FALLBACK_ITEM_SIZE}
            keepMounted={keepMounted}
            ref={setVirtualizer}
            scrollRef={scrollRef}
          >
            {(item) => <SessionTimelineVirtualRow activeTurnId={activeTurnId} item={item} key={item.id} onRevertToMessage={onRevertToMessage} />}
          </Virtualizer>
        </div>
      )}
      {showScrollToEndButton && (
        <IconButton
          className="absolute bottom-4 left-1/2 z-10 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-[#181818] text-white ring-1 ring-neutral-700 transition hover:bg-[#202020]"
          label="Scroll to latest message"
          onClick={scrollToLatest}
          size="none"
          variant="bare"
        >
          <Icon name="arrow-down" size="sm" />
        </IconButton>
      )}
    </div>
  );
}
