import SessionTimelineItemFrame from "@/features/sessions/components/timeline/rows/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/rows/session-timeline-row";
import type {TimelineRow} from "@/features/sessions/lib/timeline/rows/timeline-rows";

interface SessionTimelineVirtualRowProps {
  readonly activeTurnId: string | null;
  readonly item: TimelineRow;
  readonly onRevertToMessage?: (turnId: string) => void;
}

export default function SessionTimelineVirtualRow(props: SessionTimelineVirtualRowProps) {
  const {activeTurnId, item, onRevertToMessage} = props;

  if (item.type === "stream-error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-6 md:px-8" data-timeline-row="stream-error">
        <p className="text-sm text-danger-ink">{item.message}</p>
      </div>
    );
  }

  return (
    <SessionTimelineItemFrame item={item}>
      <SessionTimelineRow item={item} onRevertToMessage={activeTurnId && item.turnId === activeTurnId ? undefined : onRevertToMessage} />
    </SessionTimelineItemFrame>
  );
}
