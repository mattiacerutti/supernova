import {z} from "zod";
import type {AgentState, EntryRecord, LiveState, UsageState} from "./pi";
import {UserMessageContentPart} from "./user-message";
import {SessionWorktree} from "./worktree";

/** Current token usage for the active session context. */
export const SessionContextUsage = z.object({
  /** Tokens currently used by the provider context, or null when Pi cannot safely know yet. */
  usedTokens: z.number().nullable(),
  /** Maximum token window for the current model. */
  contextWindow: z.number(),
});

/** Pi's entry plus authored content on user messages that start displayed turns; stored Pi entries are unchanged. */
export const SessionEntry = z.custom<EntryRecord>().and(
  z.object({
    /** Authored parts; image payloads remain in the model message. Absent on extension continuations. */
    contentParts: z.array(UserMessageContentPart).readonly().optional(),
  })
);

/**
 * A session as Pi holds it, plus what Supernova adds. The server keeps one such document per session as Chord
 * replicated state (`SessionRuntimeService.session`), which reaches attached clients as deltas.
 */
export const Session = z.object({
  /** Stable session identifier. */
  id: z.string(),
  /** Human-readable session title. */
  title: z.string(),
  /** Whether the session was forked from another session. */
  forked: z.boolean(),
  /** Pinned sessions list first in their project. */
  pinned: z.boolean(),
  /** Absolute path of the project the session belongs to. The agent runs here unless `worktree` is set. */
  projectPath: z.string(),
  /** The worktree the agent runs in, for sessions started in a new worktree. */
  worktree: SessionWorktree.optional(),
  /** ISO timestamp for the last session update. */
  updatedAt: z.string(),
  /** The visible conversation's history in append order, compacted entries included; system prompt entries left out. */
  entries: z.array(SessionEntry).readonly(),
  /** Entries hidden behind undo, in append order, available for redo. */
  undone: z.array(SessionEntry).readonly(),
  /** The visible conversation's `pi.agent`: model, thinking level, working directory. */
  agent: z.custom<AgentState>(),
  /** The visible conversation's `pi.live`: the active run, its streaming partial, running tools, and compactions. */
  live: z.custom<LiveState>(),
  /** The visible conversation's `pi.usage`. */
  usage: z.custom<UsageState>(),
  /**
   * The first user entry of the active run, while there is one; Pi's run lists its input submissions, not entries.
   * Entries from it on are the turn being answered.
   */
  runStart: z.number().optional(),
  /** Current token usage for the active model context. */
  context: SessionContextUsage,
});

/** Minimal session metadata used when listing sessions. */
export const SessionSummary = z.object({
  /** Stable session identifier. */
  id: z.string(),
  /** Whether the session was forked from another session. */
  forked: z.boolean(),
  /** Human-readable session title. */
  title: z.string(),
  /** ISO timestamp for the last session update. */
  updatedAt: z.string(),
  /** Whether the session runs in its own worktree. */
  worktree: z.boolean(),
  /** Pinned sessions list first in their project. */
  pinned: z.boolean(),
});

export type Session = z.infer<typeof Session>;
export type SessionContextUsage = z.infer<typeof SessionContextUsage>;
export type SessionSummary = z.infer<typeof SessionSummary>;
export type SessionEntry = z.infer<typeof SessionEntry>;
