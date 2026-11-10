import {arr, bool, int, nul, num, obj, opt, type Static, str, union} from "@earendil-works/chord";
import {json} from "@supernova/contracts/lib/protocol";
import type {AgentState, EntryRecord, LiveState, UsageState} from "./pi";
import {UserMessageContentPart} from "./user-message";
import {SessionWorktree} from "./worktree";

export const SessionContextUsage = obj({
  /** Null until Pi has measured the context. */
  usedTokens: union([num(), nul()]),
  contextWindow: num(),
});

export const SessionEntry = json<EntryRecord & {readonly contentParts?: readonly UserMessageContentPart[]}>();

export const SessionEntries = obj({
  items: arr(SessionEntry),
  remaining: int({min: 0}),
  /** The entry before `items` on this branch, outside the page or not. */
  precedingEntryId: union([int({min: 0}), nul()]),
});

export const Session = obj({
  id: str(),
  /** In a fork, the last turn copied from its source. */
  lastCopiedTurnId: opt(str()),
  updatedAt: str(),
  entries: SessionEntries,
  undone: SessionEntries,
  agent: json<AgentState>(),
  live: json<LiveState>(),
  usage: json<UsageState>(),
  /** The active run's first user entry. */
  runStart: opt(num()),
  context: SessionContextUsage,
});

export const SessionSummaryFields = {
  id: str(),
  forked: bool(),
  title: str(),
  updatedAt: str(),
  worktree: opt(SessionWorktree),
  pinned: bool(),
};

export const SessionSummary = obj(SessionSummaryFields);

export type Session = Static<typeof Session>;
export type SessionContextUsage = Static<typeof SessionContextUsage>;
export type SessionSummary = Static<typeof SessionSummary>;
export type SessionEntry = Static<typeof SessionEntry>;
export type SessionEntries = Static<typeof SessionEntries>;
