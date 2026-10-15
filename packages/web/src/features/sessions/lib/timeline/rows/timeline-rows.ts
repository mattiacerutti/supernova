import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

export interface StreamErrorTimelineRow {
  readonly id: string;
  readonly message: string;
  readonly turnId: string;
  readonly type: "stream-error";
}

export type TimelineRow = SessionTimelineItem | StreamErrorTimelineRow;

interface BuildTimelineRowsInput {
  readonly items: readonly SessionTimelineItem[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly streamError: string | null;
}

export function buildTimelineRows(input: BuildTimelineRowsInput): readonly TimelineRow[] {
  const {items, liveItems, streamError} = input;
  const rows: TimelineRow[] = [...items, ...liveItems];
  const activeTurnId = liveItems[0]?.turnId ?? items.at(-1)?.turnId ?? "session";

  if (streamError) rows.push({id: `stream-error:${activeTurnId}`, message: streamError, turnId: activeTurnId, type: "stream-error"});

  return rows;
}

/** Keyed by the turn's position in the whole history so identity survives settlement and prepended turns. */
export function buildTimelineRowKeys(rows: readonly TimelineRow[], earlierTurns: number): readonly string[] {
  const typeCounts = new Map<string, number>();
  let turnIndex = earlierTurns - 1;

  return rows.map((item) => {
    if (item.type === "user") {
      turnIndex += 1;
      typeCounts.clear();
    }

    const typeIndex = typeCounts.get(item.type) ?? 0;
    typeCounts.set(item.type, typeIndex + 1);
    return `turn:${turnIndex}:${item.type}:${typeIndex}`;
  });
}

export function hasLiveTimelineOutput(items: readonly SessionTimelineItem[]): boolean {
  return items.some((item) => {
    if (item.type === "assistant") return item.event.content.trim().length > 0;
    if (item.type === "work") return item.events.length > 0;
    if (item.type === "reasoning") return item.event.content.trim().length > 0;
    return item.type === "compaction";
  });
}
