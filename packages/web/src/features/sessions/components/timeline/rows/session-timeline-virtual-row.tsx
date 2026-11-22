import ForkDivider from "@/features/sessions/components/timeline/rows/fork-divider";
import SessionTimelineItemFrame from "@/features/sessions/components/timeline/rows/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/rows/session-timeline-row";
import type {TimelineRow, TimelineSpacing} from "@/features/sessions/lib/timeline/rows/timeline-rows";

interface SessionTimelineVirtualRowProps {
  readonly activeTurnId: string | null;
  readonly gap: TimelineSpacing | undefined;
  readonly item: TimelineRow;
  readonly onForkFromTurn?: (turnId: string) => void;
  readonly onRevertToMessage?: (turnId: string) => void;
}

export default function SessionTimelineVirtualRow(props: SessionTimelineVirtualRowProps) {
  const {activeTurnId, gap, item, onForkFromTurn, onRevertToMessage} = props;
  const settled = !activeTurnId || item.turnId !== activeTurnId;

  return (
    <SessionTimelineItemFrame gap={gap}>
      {item.type === "fork-divider" ? (
        <ForkDivider />
      ) : item.type === "stream-error" ? (
        <p className="text-sm text-danger-ink" data-timeline-row="stream-error">
          {item.message}
        </p>
      ) : (
        <SessionTimelineRow item={item} onForkFromTurn={settled ? onForkFromTurn : undefined} onRevertToMessage={settled ? onRevertToMessage : undefined} />
      )}
    </SessionTimelineItemFrame>
  );
}
