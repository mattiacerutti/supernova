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

export type TimelineSpacing = "apart" | "close";

/** Prompts and separators stand apart from their neighbors; a response's steps, errors included, sit close. */
export function rowSpacing(row: TimelineRow): TimelineSpacing {
  return row.type === "user" || row.type === "fork-divider" || row.type === "compaction" ? "apart" : "close";
}

/**
 * The space below a row: the wider of its spacing and the next one's, so it never depends on which of the two draws it.
 * Below rather than above, so a page of history prepended above a row leaves that row's height alone.
 */
export function gapBelow(spacing: TimelineSpacing, next: TimelineSpacing | undefined): TimelineSpacing | undefined {
  if (next === undefined) return undefined;
  return spacing === "apart" || next === "apart" ? "apart" : "close";
}

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

/**
 * By turn position, so keys survive prepended turns, and row id, so settlement keeps the rows it doesn't fold.
 * User rows use the turn alone: a sent message's id changes when the server echoes it.
 */
export function buildTimelineRowKeys(rows: readonly TimelineRow[], earlierTurns: number): readonly string[] {
  let turnIndex = earlierTurns - 1;

  return rows.map((item) => {
    if (item.type === "user") turnIndex += 1;
    return `turn:${turnIndex}:${item.type === "user" ? "user" : item.id}`;
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
