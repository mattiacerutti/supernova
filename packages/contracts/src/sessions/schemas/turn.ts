import {Schema} from "effect";
import {ModelReference} from "./model";
import {Tool} from "./tool";
import {UserMessage} from "./user-message";

/** Assistant response content produced during a turn. */
export const AssistantTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** Assistant-visible response text. */
  content: Schema.String,
  /** Event duration in milliseconds, when provided by the runtime. */
  durationMs: Schema.optional(Schema.Number),
  /** Assistant or provider error associated with this response event. */
  error: Schema.optional(Schema.String),
  /** ISO timestamp for when the event started or was created. */
  timestamp: Schema.String,
  type: Schema.Literal("assistant"),
});

/** Internal reasoning or thinking content produced by the model during a turn. */
export const ReasoningTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** Reasoning text emitted by the model. */
  content: Schema.String,
  /** Event duration in milliseconds, when provided by the runtime. */
  durationMs: Schema.optional(Schema.Number),
  /** ISO timestamp for when the event started or was created. */
  timestamp: Schema.String,
  type: Schema.Literal("reasoning"),
});

/** Tool invocation event produced during a turn. */
export const ToolTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** Event duration in milliseconds, when provided by the runtime. */
  durationMs: Schema.optional(Schema.Number),
  /** ISO timestamp for when the event started or was created. */
  timestamp: Schema.String,
  /** Tool metadata, input, output, and status. */
  tool: Schema.optional(Tool),
  type: Schema.Literal("tool"),
});

/** Context compaction event produced during a turn. */
export const CompactionTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** ISO timestamp for when the compaction started or was persisted. */
  timestamp: Schema.String,
  /** Current lifecycle state of the compaction. */
  status: Schema.Union([Schema.Literal("pending"), Schema.Literal("completed"), Schema.Literal("error")]),
  /** Generated compaction summary, when compaction completed successfully. */
  summary: Schema.optional(Schema.String),
  /** Compaction error, when compaction failed. */
  error: Schema.optional(Schema.String),
  type: Schema.Literal("compaction"),
});

/** Any non-user event that can occur within a session turn. */
export const TurnEvent = Schema.Union([AssistantTurnEvent, ReasoningTurnEvent, ToolTurnEvent, CompactionTurnEvent]);

/** A single user request and all agent activity produced in response. */
export const Turn = Schema.Struct({
  /** Stable turn identifier. */
  id: Schema.String,
  /** Current lifecycle state of the turn. */
  status: Schema.Union([Schema.Literal("completed"), Schema.Literal("error"), Schema.Literal("streaming")]),
  /** Model configuration used for this turn. */
  model: ModelReference,
  /** User message that initiated the turn. */
  userMessage: UserMessage,
  /** Ordered assistant, reasoning, and tool events produced for the turn. */
  events: Schema.Array(TurnEvent),
  /** ISO timestamp for when the turn started. */
  startedAt: Schema.optional(Schema.String),
  /** ISO timestamp for when the turn completed or errored, when known. */
  completedAt: Schema.optional(Schema.String),
});

export type AssistantTurnEvent = typeof AssistantTurnEvent.Type;
export type CompactionTurnEvent = typeof CompactionTurnEvent.Type;
export type ReasoningTurnEvent = typeof ReasoningTurnEvent.Type;
export type ToolTurnEvent = typeof ToolTurnEvent.Type;
export type Turn = typeof Turn.Type;
export type TurnEvent = typeof TurnEvent.Type;
