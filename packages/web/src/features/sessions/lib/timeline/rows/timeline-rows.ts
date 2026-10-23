import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";

export interface StreamErrorTimelineRow {
  readonly id: string;
  readonly message: string;
  readonly turnId: string;
  readonly type: "stream-error";
}

/** Where a fork's copied history ends and its own turns begin. */
export interface ForkDividerTimelineRow {
  readonly id: string;
  readonly turnId: string;
  readonly type: "fork-divider";
}

export type TimelineRow = ForkDividerTimelineRow | SessionTimelineItem | StreamErrorTimelineRow;

interface BuildTimelineRowsInput {
  readonly items: readonly TimelineRow[];
  readonly liveItems: readonly SessionTimelineItem[];
  readonly streamError: string | null;
}

/** Committed rows, with the divider after the rows of `lastCopiedTurnId` once those are loaded. Copied turns are never live. */
export function withForkDivider(items: readonly SessionTimelineItem[], lastCopiedTurnId: string | undefined): readonly TimelineRow[] {
  const lastCopiedIndex = lastCopiedTurnId === undefined ? -1 : items.findLastIndex((item) => item.turnId === lastCopiedTurnId);
  if (lastCopiedIndex === -1) return items;
  const turnId = `fork-divider:${lastCopiedTurnId}`;
  return [...items.slice(0, lastCopiedIndex + 1), {id: turnId, turnId, type: "fork-divider"}, ...items.slice(lastCopiedIndex + 1)];
}

export function buildTimelineRows(input: BuildTimelineRowsInput): readonly TimelineRow[] {
  const {items, liveItems, streamError} = input;
  const rows: TimelineRow[] = [...items, ...liveItems];
  const activeTurnId = liveItems[0]?.turnId ?? items.findLast((row) => row.type !== "fork-divider")?.turnId ?? "session";

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
