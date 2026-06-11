import {LegendList} from "@legendapp/list/react";
import {useCallback} from "react";
import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SessionTimelineFooter from "@/features/sessions/components/timeline/session-timeline-footer";
import SessionTimelineItemFrame from "@/features/sessions/components/timeline/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/session-timeline-row";
import {useSessionTimelineAutoScroll} from "@/features/sessions/hooks/use-session-timeline-auto-scroll";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

interface SessionTimelineProps {
  readonly compacting: boolean;
  readonly forceFollow: boolean;
  readonly isStreaming: boolean;
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly onRevertToMessage?: (turnId: string) => void;
  readonly streamError: string | null;
}

export default function SessionTimeline(props: SessionTimelineProps) {
  const {compacting, forceFollow, isStreaming, items, liveItems, onRevertToMessage, streamError} = props;

  const {listRef, liveTailRef, maintainScrollAtEnd, onScroll, onWheelCapture, scrollToLatest, showScrollToEndButton} =
    useSessionTimelineAutoScroll({
      forceFollow,
      items,
      liveItems,
      liveTailTurnId: liveItems[0]?.turnId ?? null,
    });
  const renderItem = useCallback(
    (renderProps: {item: SessionTimelineItem}): ReactNode => (
      <SessionTimelineItemFrame item={renderProps.item}>
        <SessionTimelineRow item={renderProps.item} onRevertToMessage={onRevertToMessage} />
      </SessionTimelineItemFrame>
    ),
    [onRevertToMessage]
  );

  const hasTimelineContent = items.length > 0 || liveItems.length > 0 || isStreaming || streamError !== null;

  return (
    <div className="relative min-h-0 flex-1 select-text">
      {!hasTimelineContent && (
        <div className="flex min-h-full items-center justify-center px-5 pb-8 pt-6 md:px-8">
          <p className="text-center text-sm text-neutral-600">No messages yet.</p>
        </div>
      )}
      {hasTimelineContent && (
        <LegendList<SessionTimelineItem>
          aria-label="Session timeline"
          className="h-full overflow-x-hidden overscroll-y-contain"
          contentContainerStyle={{paddingTop: 24}}
          data={items}
          estimatedItemSize={140}
          initialScrollAtEnd
          keyExtractor={(item) => item.id}
          ListFooterComponent={
            <div ref={liveTailRef}>
              <SessionTimelineFooter compacting={compacting} isStreaming={isStreaming} liveItems={liveItems} streamError={streamError} />
            </div>
          }
          maintainScrollAtEnd={maintainScrollAtEnd}
          maintainScrollAtEndThreshold={0.1}
          maintainVisibleContentPosition
          onScroll={onScroll}
          onWheelCapture={onWheelCapture}
          ref={listRef}
          renderItem={renderItem}
        />
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
