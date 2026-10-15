import {z} from "zod";
import type {AgentState, EntryRecord, LiveState, UsageState} from "./pi";
import {UserMessageContentPart} from "./user-message";
import {SessionWorktree} from "./worktree";

export const SessionContextUsage = z.object({
  /** Null until Pi has measured the context. */
  usedTokens: z.number().nullable(),
  contextWindow: z.number(),
});

export const SessionEntry = z.custom<EntryRecord>().and(
  z.object({
    /** Authored parts; image payloads remain in the model message. Absent on extension continuations. */
    contentParts: z.array(UserMessageContentPart).readonly().optional(),
  })
);

export const SessionEntries = z.object({
  items: z.array(SessionEntry).readonly(),
  remaining: z.number().int().nonnegative(),
});

export const Session = z.object({
  id: z.string(),
  title: z.string(),
  forked: z.boolean(),
  pinned: z.boolean(),
  projectPath: z.string(),
  worktree: SessionWorktree.optional(),
  updatedAt: z.string(),
  /** Newest whole turns; `remaining` counts the earlier ones, read with `loadHistory`. */
  entries: SessionEntries,
  undone: SessionEntries,
  agent: z.custom<AgentState>(),
  live: z.custom<LiveState>(),
  usage: z.custom<UsageState>(),
  /** First user entry of the active run; Pi's run lists submissions, not entries. */
  runStart: z.number().optional(),
  context: SessionContextUsage,
});

export const SessionSummary = z.object({
  id: z.string(),
  forked: z.boolean(),
  title: z.string(),
  updatedAt: z.string(),
  worktree: z.boolean(),
  pinned: z.boolean(),
});

export type Session = z.infer<typeof Session>;
export type SessionContextUsage = z.infer<typeof SessionContextUsage>;
export type SessionSummary = z.infer<typeof SessionSummary>;
export type SessionEntry = z.infer<typeof SessionEntry>;
export type SessionEntries = z.infer<typeof SessionEntries>;
