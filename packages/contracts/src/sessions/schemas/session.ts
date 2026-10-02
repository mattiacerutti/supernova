import {Schema} from "effect";
import type {AgentState, EntryRecord, LiveState, UsageState} from "./pi";
import {PiJson} from "./pi";
import {UserMessageContentPart} from "./user-message";
import {SessionWorktree} from "./worktree";

/** Current token usage for the active session context. */
export const SessionContextUsage = Schema.Struct({
  /** Tokens currently used by the provider context, or null when Pi cannot safely know yet. */
  usedTokens: Schema.NullOr(Schema.Number),
  /** Maximum token window for the current model. */
  contextWindow: Schema.Number,
});

/** What Supernova adds to a user entry that starts a turn: the content as the composer authored it. */
export const SessionTurnRecord = Schema.Struct({
  /** Authored parts; image attachments carry no payload, the user entry's image content has it. */
  contentParts: Schema.Array(UserMessageContentPart),
});

/**
 * A session as Pi holds it, plus what Supernova adds. The server keeps one such document per session and streams
 * changes to it as Chord deltas (`session.state`); `version` counts them.
 */
export const Session = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Number of `session.state` deltas this value includes; the next applies to it only if it is `version + 1`. */
  version: Schema.Number,
  /** Human-readable session title. */
  title: Schema.String,
  /** Whether the session was forked from another session. */
  forked: Schema.Boolean,
  /** Absolute path of the project the session belongs to. The agent runs here unless `worktree` is set. */
  projectPath: Schema.String,
  /** The worktree the agent runs in, for sessions started in a new worktree. */
  worktree: Schema.optional(SessionWorktree),
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
  /** The visible conversation's history in append order, compacted entries included; system prompt entries left out. */
  entries: PiJson<readonly EntryRecord[]>(),
  /** Entries hidden behind undo, in append order, available for redo. */
  undone: PiJson<readonly EntryRecord[]>(),
  /** The visible conversation's `pi.agent`: model, thinking level, working directory. */
  agent: PiJson<AgentState>(),
  /** The visible conversation's `pi.live`: the active run, its streaming partial, running tools, and compactions. */
  live: PiJson<LiveState>(),
  /** The visible conversation's `pi.usage`. */
  usage: PiJson<UsageState>(),
  /**
   * The first user entry of the active run, while there is one; Pi's run lists its input submissions, not entries.
   * Entries from it on are the turn being answered.
   */
  runStart: Schema.optional(Schema.Number),
  /** Turn records keyed by the id of the user entry that starts the turn. A user entry without one continues a turn. */
  turns: Schema.Record(Schema.String, SessionTurnRecord),
  /** Current token usage for the active model context. */
  context: SessionContextUsage,
});

/** Minimal session metadata used when listing sessions. */
export const SessionSummary = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Whether the session was forked from another session. */
  forked: Schema.Boolean,
  /** Human-readable session title. */
  title: Schema.String,
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
  /** Whether the session runs in its own worktree. */
  worktree: Schema.Boolean,
});

export type Session = typeof Session.Type;
export type SessionContextUsage = typeof SessionContextUsage.Type;
export type SessionSummary = typeof SessionSummary.Type;
export type SessionTurnRecord = typeof SessionTurnRecord.Type;
