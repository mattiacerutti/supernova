import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

export function getSessionTimelineItemKey(item: SessionTimelineItem): string {
  return item.id;
}
