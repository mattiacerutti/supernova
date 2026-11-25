import {arr, int, nul, num, obj, opt, type Static, str, union} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {AgentState, EntryRecord, LiveState, UsageState} from "./pi";
import {UserMessageContentPart} from "./user-message";

export const ChatContextUsage = obj({
  /** Null until Pi has measured the context. */
  usedTokens: union([num(), nul()]),
  contextWindow: num(),
});

/** Pi's user message, with `UserEntryData`. */
export const USER_ENTRY_KIND = "supernova.user";

export const ChatEntry = json<EntryRecord>();

export const ChatEntries = obj({
  items: arr(ChatEntry),
  remaining: int({min: 0}),
  /** The entry before `items` on this branch, outside the page or not. */
  precedingEntryId: union([int({min: 0}), nul()]),
});

export const ChatDocument = obj({
  id: str(),
  /** In a fork, the last turn copied from its source. */
  lastCopiedTurnId: opt(str()),
  entries: ChatEntries,
  undone: ChatEntries,
  agent: json<AgentState>(),
  live: json<LiveState>(),
  usage: json<UsageState>(),
  /** The active run's first user entry. */
  runStart: opt(num()),
  context: ChatContextUsage,
});

export type ChatDocument = Static<typeof ChatDocument>;
export type ChatContextUsage = Static<typeof ChatContextUsage>;
export type ChatEntry = Static<typeof ChatEntry>;
export type ChatEntries = Static<typeof ChatEntries>;

/** Pi's own user entries, such as an extension's continuation, are not turns: they belong to the turn before them. */
export interface UserEntryData {
  readonly contentParts: readonly UserMessageContentPart[];
  /** Turns before this one in its conversation, so a page knows its position without counting. */
  readonly turnIndex: number;
}

export function userEntryData(entry: EntryRecord | undefined): UserEntryData | undefined {
  return entry?.kind === USER_ENTRY_KIND ? (entry.data as unknown as UserEntryData) : undefined;
}
