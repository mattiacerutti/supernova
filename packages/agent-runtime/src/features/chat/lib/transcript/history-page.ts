import type {EntryRecord} from "@earendil-works/pi-durable";
import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatEntries, ChatEntry} from "@supernova/contracts/services/chat/schemas";
import type {TurnRecord} from "@supernova/agent-runtime/core/session-state";

const PAGE_TURNS = 20;
/** A page holds at least one whole turn, so a turn over the 16 MiB frame limit still fails. */
const PAGE_SIZE = 2 * 1024 * 1024;

const entrySizes = new WeakMap<EntryRecord, number>();

function entrySize(entry: EntryRecord): number {
  let size = entrySizes.get(entry);
  if (size === undefined) {
    size = JSON.stringify(entry).length;
    entrySizes.set(entry, size);
  }
  return size;
}

function authoredEntries(entries: readonly EntryRecord[], turns: Readonly<Record<string, TurnRecord>>): ChatEntry[] {
  return entries.map((entry) => {
    const record = entry.kind === "pi.user" ? turns[String(entry.id)] : undefined;
    return record ? {...entry, contentParts: record.contentParts} : entry;
  });
}

/** The page of whole turns nearest the undo point: the newest before it, or the oldest undone after it. */
export function historyPage(input: {
  readonly side: HistorySide;
  readonly entries: readonly EntryRecord[];
  readonly turns: Readonly<Record<string, TurnRecord>>;
  readonly precedingEntryId?: number;
}): ChatEntries {
  const {side, entries, turns} = input;

  const starts = entries.flatMap((entry, index) => (entry.kind === "pi.user" && turns[String(entry.id)] ? [index] : []));
  const bounds = [...starts, entries.length];
  const sizes = starts.map((turnStart, index) => entries.slice(turnStart, bounds[index + 1]).reduce((total, entry) => total + entrySize(entry), 0));

  const pageTurnCount = (sizes: readonly number[]) => {
    let count = 0;
    let size = 0;
    for (const turnSize of sizes) {
      if (count > 0 && (count === PAGE_TURNS || size + turnSize > PAGE_SIZE)) break;
      size += turnSize;
      count += 1;
    }
    return count;
  };

  const count = pageTurnCount(side === "entries" ? sizes.toReversed() : sizes);
  const remaining = starts.length - count;
  const start = side === "entries" && remaining > 0 ? starts[remaining]! : 0;
  const items = remaining === 0 ? entries : entries.slice(start, side === "undone" ? starts[count] : entries.length);
  const precedingEntryId = items.length === 0 ? null : start > 0 ? entries[start - 1]!.id : (input.precedingEntryId ?? null);
  return {items: authoredEntries(items, turns), remaining, precedingEntryId};
}
