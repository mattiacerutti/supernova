import type {EntryRecord} from "@earendil-works/pi-durable";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatEntries} from "@supernova/contracts/services/chat/schemas";
import {USER_ENTRY_KIND, userEntryData} from "@supernova/contracts/services/chat/schemas";

export const PAGE_TURNS = 20;
/** A page holds at least one whole turn, so a turn over the 16 MiB frame limit still fails. */
export const PAGE_SIZE = 2 * 1024 * 1024;

const entrySizes = new WeakMap<EntryRecord, number>();

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

export function isTurnStart(entry: EntryRecord): boolean {
  return entry.kind === USER_ENTRY_KIND;
}

export function turnsThrough(entries: readonly EntryRecord[]): number {
  return (userEntryData(entries.findLast(isTurnStart))?.turnIndex ?? -1) + 1;
}

export function withoutSystemEntries(entries: readonly EntryRecord[]): EntryRecord[] {
  return entries.filter((entry) => entry.kind !== "pi.system");
}

function pageTurns(side: HistorySide, entries: readonly EntryRecord[]): {readonly starts: readonly number[]; readonly count: number} {
  // The entries after a turn's user entry, up to the next one, belong to it.
  const starts = entries.flatMap((entry, index) => (isTurnStart(entry) ? [index] : []));
  const bounds = [...starts, entries.length];
  const sizes = starts.map((turnStart, index) => entriesSize(entries.slice(turnStart, bounds[index + 1])));

  let count = 0;
  let size = 0;
  for (const turnSize of side === "entries" ? sizes.toReversed() : sizes) {
    if (!joinsPage(count, size, turnSize)) break;
    size += turnSize;
    count += 1;
  }
  return {starts, count};
}

export function joinsPage(count: number, size: number, turnSize: number): boolean {
  return count === 0 || (count < PAGE_TURNS && size + turnSize <= PAGE_SIZE);
}

/**
 * The page of whole turns nearest the undo point: the newest before it, or the oldest undone after it. `entries` start
 * at a turn or at the conversation's start. `remaining` comes from turn indexes, so nothing counts entries; on the
 * undone side, `lastTurnIndex` is that of the conversation's last turn.
 */
export function historyPage(input: {
  readonly side: HistorySide;
  readonly entries: readonly EntryRecord[];
  readonly lastTurnIndex?: number;
  readonly precedingEntryId?: number;
}): ChatEntries {
  const {side, entries} = input;
  const {starts, count} = pageTurns(side, entries);
  const skipped = starts.length - count;

  const start = side === "entries" && skipped > 0 ? starts[skipped]! : 0;
  const end = side === "undone" && skipped > 0 ? starts[count]! : entries.length;
  const items = entries.slice(start, end);

  const first = items[0];
  const firstTurn = userEntryData(items.find(isTurnStart));
  const lastTurn = userEntryData(items.findLast(isTurnStart));
  const remaining = side === "entries" ? (firstTurn?.turnIndex ?? 0) : lastTurn ? Math.max(0, (input.lastTurnIndex ?? 0) - lastTurn.turnIndex) : 0;
  const precedingEntryId = !first ? null : start > 0 ? entries[start - 1]!.id : (input.precedingEntryId ?? null);
  return {items, remaining, precedingEntryId};
}
