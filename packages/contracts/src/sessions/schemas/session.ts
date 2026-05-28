import {Schema} from "effect";
import {ModelReference} from "./model";
import {Turn} from "./turn";

/** Full session transcript and metadata. */
export const Session = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Human-readable session title. */
  title: Schema.String,
  /** Current session model configuration, when the runtime exposes one. */
  model: Schema.optional(ModelReference),
  /** Absolute path of the project/workspace associated with the session. */
  projectPath: Schema.String,
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
  /** Human-readable session title. */
  title: Schema.String,
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
});

export type Session = typeof Session.Type;
export type SessionSummary = typeof SessionSummary.Type;
