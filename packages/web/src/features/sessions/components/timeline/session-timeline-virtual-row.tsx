import SessionTimelineItemFrame from "@/features/sessions/components/timeline/session-timeline-item-frame";
import SessionTimelineRow from "@/features/sessions/components/timeline/session-timeline-row";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

interface SpacerTimelineItem {
  readonly id: "bottom-spacer" | "top-spacer";
  readonly type: "bottom-spacer" | "top-spacer";
}

interface StreamingStatusTimelineItem {
  readonly id: string;
  readonly label: string;
  readonly turnId: string;
  readonly type: "streaming-status";
}

interface StreamErrorTimelineItem {
  readonly id: string;
  readonly message: string;
  readonly turnId: string;
  readonly type: "stream-error";
}

export type TimelineVirtualItem = SessionTimelineItem | SpacerTimelineItem | StreamingStatusTimelineItem | StreamErrorTimelineItem;

function isSessionTimelineItem(item: TimelineVirtualItem): item is SessionTimelineItem {
  return item.type === "assistant" || item.type === "compaction" || item.type === "user" || item.type === "work";
}

interface StreamingStatusLabelProps {
  readonly label: string;
}

function StreamingStatusLabel(props: StreamingStatusLabelProps) {
  const {label} = props;

  return (
    <div className="relative w-fit text-sm text-neutral-600">
      <span>{label}</span>
      <span aria-hidden="true" className="thinking-shimmer absolute inset-0 text-neutral-200">
        {label}
      </span>
    </div>
  );
}

interface SessionTimelineVirtualRowProps {
  readonly activeTurnId: string | null;
  readonly inlineStatusLabel?: string;
  readonly item: TimelineVirtualItem;
  readonly onRevertToMessage?: (turnId: string) => void;
}

export default function SessionTimelineVirtualRow(props: SessionTimelineVirtualRowProps) {
  const {activeTurnId, inlineStatusLabel, item, onRevertToMessage} = props;

  if (item.type === "top-spacer") return <div aria-hidden="true" className="h-6" data-timeline-row="top-spacer" />;
  if (item.type === "bottom-spacer") return <div aria-hidden="true" className="h-6" data-timeline-row="bottom-spacer" />;

  if (item.type === "streaming-status") {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-8 md:px-8" data-timeline-row="streaming-status">
        <StreamingStatusLabel label={item.label} />
      </div>
    );
  }

  if (item.type === "stream-error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 pb-6 md:px-8" data-timeline-row="stream-error">
        <p className="text-sm text-red-300">{item.message}</p>
      </div>
    );
  }

  if (!isSessionTimelineItem(item)) return null;

  return (
    <SessionTimelineItemFrame item={item}>
      <SessionTimelineRow item={item} onRevertToMessage={activeTurnId && item.turnId === activeTurnId ? undefined : onRevertToMessage} />
      {inlineStatusLabel && (
        <div className="mt-4" data-timeline-row="inline-streaming-status">
          <StreamingStatusLabel label={inlineStatusLabel} />
        </div>
      )}
    </SessionTimelineItemFrame>
  );
}
