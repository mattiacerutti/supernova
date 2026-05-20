import SessionTimelineItemFrame from "@/features/sessions/components/timeline/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/session-timeline-row";
import {getSessionTimelineItemKey} from "@/features/sessions/lib/session-timeline/session-timeline-keys";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

interface SessionTimelineFooterProps {
  readonly isStreaming: boolean;
  readonly liveItems: readonly SessionTimelineItem[];
  readonly streamError: string | null;
}

export default function SessionTimelineFooter(props: SessionTimelineFooterProps) {
  const {isStreaming, liveItems, streamError} = props;

  return (
    <>
      {liveItems.map((item) => (
        <SessionTimelineItemFrame item={item} key={getSessionTimelineItemKey(item)}>
          <SessionTimelineRow item={item} />
        </SessionTimelineItemFrame>
      ))}
      <div className="mx-auto w-full max-w-3xl px-5 pb-6 md:px-8">
        {isStreaming && (
          <div className="relative w-fit text-sm text-neutral-600">
            <span>Thinking</span>
            <span aria-hidden="true" className="thinking-shimmer absolute inset-0 text-neutral-200">
              Thinking
            </span>
          </div>
        )}
        {streamError && <p className="text-sm text-red-300">{streamError}</p>}
      </div>
    </>
  );
}
