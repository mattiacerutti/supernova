import {z} from "zod";
import {array, piJson, record, struct} from "@supernova/contracts/runtime/schemas";
import type {AgentState, EntryRecord, LiveState, UsageState} from "./pi";
import {UserMessageContentPart} from "./user-message";
import {SessionWorktree} from "./worktree";

/** Current token usage for the active session context. */
export const SessionContextUsage = struct({
  /** Tokens currently used by the provider context, or null when Pi cannot safely know yet. */
  usedTokens: z.number().nullable(),
  /** Maximum token window for the current model. */
  contextWindow: z.number(),
});

/** What Supernova adds to a user entry that starts a turn: the content as the composer authored it. */
export const SessionTurnRecord = struct({
  /** Authored parts; image attachments carry no payload, the user entry's image content has it. */
  contentParts: array(UserMessageContentPart),
});

/**
 * A session as Pi holds it, plus what Supernova adds. The server keeps one such document per session as Chord
 * replicated state (`SessionTranscript`), which reaches attached clients as deltas.
 */
export const Session = struct({
  /** Stable session identifier. */
  id: z.string(),
  /** Human-readable session title. */
  title: z.string(),
  /** Whether the session was forked from another session. */
  forked: z.boolean(),
  /** Absolute path of the project the session belongs to. The agent runs here unless `worktree` is set. */
  projectPath: z.string(),
  /** The worktree the agent runs in, for sessions started in a new worktree. */
  worktree: SessionWorktree.optional(),
  /** ISO timestamp for the last session update. */
  updatedAt: z.string(),
  /** The visible conversation's history in append order, compacted entries included; system prompt entries left out. */
  entries: piJson<readonly EntryRecord[]>(),
  /** Entries hidden behind undo, in append order, available for redo. */
  undone: piJson<readonly EntryRecord[]>(),
  /** The visible conversation's `pi.agent`: model, thinking level, working directory. */
  agent: piJson<AgentState>(),
  /** The visible conversation's `pi.live`: the active run, its streaming partial, running tools, and compactions. */
  live: piJson<LiveState>(),
  /** The visible conversation's `pi.usage`. */
  usage: piJson<UsageState>(),
  /**
   * The first user entry of the active run, while there is one; Pi's run lists its input submissions, not entries.
   * Entries from it on are the turn being answered.
   */
  runStart: z.number().optional(),
  /** Turn records keyed by the id of the user entry that starts the turn. A user entry without one continues a turn. */
  turns: record(SessionTurnRecord),
  /** Current token usage for the active model context. */
  context: SessionContextUsage,
});

/** Minimal session metadata used when listing sessions. */
export const SessionSummary = struct({
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
});

export type Session = z.infer<typeof Session>;
export type SessionContextUsage = z.infer<typeof SessionContextUsage>;
export type SessionSummary = z.infer<typeof SessionSummary>;
export type SessionTurnRecord = z.infer<typeof SessionTurnRecord>;
