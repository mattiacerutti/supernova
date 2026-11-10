import {arr, int, nul, num, obj, opt, type Static, str, union} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {AgentState, EntryRecord, LiveState, UsageState} from "./pi";
import {UserMessageContentPart} from "./user-message";

export const ChatContextUsage = obj({
  /** Null until Pi has measured the context. */
  usedTokens: union([num(), nul()]),
  contextWindow: num(),
});

export const ChatEntry = json<EntryRecord & {readonly contentParts?: readonly UserMessageContentPart[]}>();

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
  updatedAt: str(),
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
