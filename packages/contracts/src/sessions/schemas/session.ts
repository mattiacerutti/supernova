import {Schema} from "effect";
import {ModelReference} from "./model";
import {Turn} from "./turn";
import {SessionWorktree} from "./worktree";

/** Current token usage for the active session context. */
export const SessionContextUsage = Schema.Struct({
  /** Tokens currently used by the provider context, or null when Pi cannot safely know yet. */
  usedTokens: Schema.NullOr(Schema.Number),
  /** Maximum token window for the current model. */
  contextWindow: Schema.Number,
});

/** Full session transcript and metadata. */
export const Session = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Human-readable session title. */
  title: Schema.String,
  /** Whether the session was forked from another session. */
  forked: Schema.Boolean,
  /** Current session model configuration, when the runtime exposes one. */
  modelReference: Schema.optional(ModelReference),
  /** Current token usage for the active model context. */
  context: SessionContextUsage,
  /** Absolute path of the project the session belongs to. The agent runs here unless `worktree` is set. */
  projectPath: Schema.String,
  /** The worktree the agent runs in, for sessions started in a new worktree. */
  worktree: Schema.optional(SessionWorktree),
  /** Ordered session transcript represented as turns. */
  turns: Schema.Array(Turn),
  /** Turns currently hidden behind undo and available for redo. */
  undoneTurns: Schema.Array(Turn),
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
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
