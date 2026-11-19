import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatDocument, ChatEntries} from "@supernova/contracts/services/chat/schemas";

function reuseEntries(known: ChatEntries, next: ChatEntries): ChatEntries {
  // Merging a paged window must not make every streaming partial rebuild the loaded transcript.
  return known.remaining === next.remaining &&
    known.precedingEntryId === next.precedingEntryId &&
    known.items.length === next.items.length &&
    known.items.every((item, index) => item === next.items[index])
    ? known
    : next;
}

export function withKnownBranch(known: ChatDocument | undefined, next: ChatDocument): ChatDocument {
  if (!known) return next;
  const branch = [...known.entries.items, ...known.undone.items];
  let {entries, undone} = next;
  const first = entries.items[0]?.id;
  const firstAt = first === undefined ? -1 : branch.findIndex((entry) => entry.id === first);
  // An oversized turn can leave no overlap when the next turn starts; its last entry still connects the windows.
  const prefixEnd = firstAt >= 0 ? firstAt : branch.findIndex((entry) => entry.id === entries.precedingEntryId) + 1;
  if (entries.remaining > 0 && prefixEnd > 0) entries = {...known.entries, items: [...branch.slice(0, prefixEnd), ...entries.items]};
  const last = undone.items.at(-1)?.id;
  const lastAt = last === undefined ? -1 : branch.findIndex((entry) => entry.id === last);
  if (undone.remaining > 0 && lastAt >= 0 && lastAt < branch.length - 1)
    undone = {...undone, items: [...undone.items, ...branch.slice(lastAt + 1)], remaining: known.undone.remaining};
  return {...next, entries: reuseEntries(known.entries, entries), undone: reuseEntries(known.undone, undone)};
}

// A page that no longer starts where it was asked for belongs to a conversation the document has left.
export function withHistoryPage(document: ChatDocument, side: HistorySide, edge: number, page: ChatEntries): ChatDocument {
  if (side === "entries") return document.entries.items[0]?.id === edge ? {...document, entries: {...page, items: [...page.items, ...document.entries.items]}} : document;
  return document.undone.items.at(-1)?.id === edge
    ? {...document, undone: {...document.undone, items: [...document.undone.items, ...page.items], remaining: page.remaining}}
    : document;
}
