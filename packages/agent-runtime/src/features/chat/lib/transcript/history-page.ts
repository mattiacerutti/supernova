import type {EntryRecord} from "@earendil-works/pi-durable";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatEntries, ChatEntry} from "@supernova/contracts/services/chat/schemas";
import type {TurnRecord} from "@supernova/agent-runtime/core/session-state";

export type Turns = Readonly<Record<string, TurnRecord>>;

export const PAGE_TURNS = 20;
/** A page holds at least one whole turn, so a turn over the 16 MiB frame limit still fails. */
export const PAGE_SIZE = 2 * 1024 * 1024;

const entrySizes = new WeakMap<EntryRecord, number>();
const sortedTurnIds = new WeakMap<Turns, readonly number[]>();

export function entriesSize(entries: readonly EntryRecord[]): number {
  let total = 0;
  for (const entry of entries) {
    let size = entrySizes.get(entry);
    if (size === undefined) {
      size = JSON.stringify(entry).length;
      entrySizes.set(entry, size);
    }
    total += size;
  }
  return total;
}

// Oldest first.
export function turnIds(turns: Turns): readonly number[] {
  let ids = sortedTurnIds.get(turns);
  if (!ids) {
    ids = Object.keys(turns)
      .map(Number)
      .toSorted((left, right) => left - right);
    sortedTurnIds.set(turns, ids);
  }
  return ids;
}

export function withoutSystemEntries(entries: readonly EntryRecord[]): EntryRecord[] {
  return entries.filter((entry) => entry.kind !== "pi.system");
}

function authoredEntries(entries: readonly EntryRecord[], turns: Turns): ChatEntry[] {
  return entries.map((entry) => {
    const record = entry.kind === "pi.user" ? turns[String(entry.id)] : undefined;
    return record ? {...entry, contentParts: record.contentParts} : entry;
  });
}

/** Where `entries`' turns start, their sizes, and how many of them `side`'s page takes. */
export function pageTurns(
  side: HistorySide,
  entries: readonly EntryRecord[],
  turns: Turns
): {readonly starts: readonly number[]; readonly sizes: readonly number[]; readonly count: number} {
  // A turn is a user entry with a record; the entries after it, up to the next one, belong to it.
  const starts = entries.flatMap((entry, index) => (entry.kind === "pi.user" && turns[String(entry.id)] ? [index] : []));
  const bounds = [...starts, entries.length];
  const sizes = starts.map((turnStart, index) => entriesSize(entries.slice(turnStart, bounds[index + 1])));

  let count = 0;
  let size = 0;
  for (const turnSize of side === "entries" ? sizes.toReversed() : sizes) {
    if (!joinsPage(count, size, turnSize)) break;
    size += turnSize;
    count += 1;
  }
  return {starts, sizes, count};
}

export function joinsPage(count: number, size: number, turnSize: number): boolean {
  return count === 0 || (count < PAGE_TURNS && size + turnSize <= PAGE_SIZE);
}

function countTurns(turns: Turns, side: "before" | "after", entryId: number): number {
  const ids = turnIds(turns);
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (ids[middle]! < entryId) low = middle + 1;
    else high = middle;
  }
  if (side === "before") return low;
  return ids.length - low - (ids[low] === entryId ? 1 : 0);
}

/**
 * The page of whole turns nearest the undo point: the newest before it, or the oldest undone after it. `entries` start
 * at a turn or at the conversation's start. `remaining` counts turn records, which are the current conversation's only.
 */
export function historyPage(input: {readonly side: HistorySide; readonly entries: readonly EntryRecord[]; readonly turns: Turns; readonly precedingEntryId?: number}): ChatEntries {
  const {side, entries, turns} = input;
  const {starts, count} = pageTurns(side, entries, turns);
  const skipped = starts.length - count;

  const start = side === "entries" && skipped > 0 ? starts[skipped]! : 0;
  const end = side === "undone" && skipped > 0 ? starts[count]! : entries.length;
  const items = entries.slice(start, end);

  const first = items[0];
  const last = items.at(-1);
  const remaining = !first || !last ? 0 : side === "entries" ? countTurns(turns, "before", first.id) : countTurns(turns, "after", last.id);
  const precedingEntryId = !first ? null : start > 0 ? entries[start - 1]!.id : (input.precedingEntryId ?? null);
  return {items: authoredEntries(items, turns), remaining, precedingEntryId};
}
