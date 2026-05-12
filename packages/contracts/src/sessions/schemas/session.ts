import {Schema} from "effect";
import {AgentModelReference} from "./model";
import {AgentSessionTurn} from "./turn";

/** Full session transcript and metadata. */
export const AgentSessionDetails = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Human-readable session title. */
  title: Schema.String,
  /** Current session model configuration, when the runtime exposes one. */
  model: Schema.optional(AgentModelReference),
  /** Absolute path of the project/workspace associated with the session. */
  projectPath: Schema.String,
  /** Ordered session transcript represented as turns. */
  turns: Schema.Array(AgentSessionTurn),
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
});

/** Minimal session metadata used when listing sessions. */
export const AgentSessionSummary = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Human-readable session title. */
  title: Schema.String,
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
});

export type AgentSessionDetails = typeof AgentSessionDetails.Type;
export type AgentSessionSummary = typeof AgentSessionSummary.Type;
