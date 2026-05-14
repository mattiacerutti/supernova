import {Schema} from "effect";
import {ModelReference} from "./model";
import {SessionTurn} from "./turn";

/** Full session transcript and metadata. */
export const SessionDetails = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Human-readable session title. */
  title: Schema.String,
  /** Current session model configuration, when the runtime exposes one. */
  model: Schema.optional(ModelReference),
  /** Absolute path of the project/workspace associated with the session. */
  projectPath: Schema.String,
  /** Ordered session transcript represented as turns. */
  turns: Schema.Array(SessionTurn),
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

export type SessionDetails = typeof SessionDetails.Type;
export type SessionSummary = typeof SessionSummary.Type;
