import {Schema} from "effect";
import {ModelReference} from "./model";
import {SessionTool} from "./tool";
import {SessionUserMessage} from "./user-message";

/** Assistant response content produced during a turn. */
export const SessionAssistantTurnEvent = Schema.Struct({
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
export const SessionReasoningTurnEvent = Schema.Struct({
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
export const SessionToolTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** Event duration in milliseconds, when provided by the runtime. */
  durationMs: Schema.optional(Schema.Number),
  /** ISO timestamp for when the event started or was created. */
  timestamp: Schema.String,
  /** Tool metadata, input, output, and status. */
  tool: Schema.optional(SessionTool),
  type: Schema.Literal("tool"),
});

/** Any non-user event that can occur within a session turn. */
export const SessionTurnEvent = Schema.Union([SessionAssistantTurnEvent, SessionReasoningTurnEvent, SessionToolTurnEvent]);

/** A single user request and all agent activity produced in response. */
export const SessionTurn = Schema.Struct({
  /** Stable turn identifier. */
  id: Schema.String,
  /** Current lifecycle state of the turn. */
  status: Schema.Union([Schema.Literal("completed"), Schema.Literal("error"), Schema.Literal("streaming")]),
  /** Model configuration used for this turn. */
  model: ModelReference,
  /** User message that initiated the turn. */
  userMessage: SessionUserMessage,
  /** Ordered assistant, reasoning, and tool events produced for the turn. */
  events: Schema.Array(SessionTurnEvent),
  /** ISO timestamp for when the turn started. */
  startedAt: Schema.optional(Schema.String),
  /** ISO timestamp for when the turn completed or errored, when known. */
  completedAt: Schema.optional(Schema.String),
});

export type SessionAssistantTurnEvent = typeof SessionAssistantTurnEvent.Type;
export type SessionReasoningTurnEvent = typeof SessionReasoningTurnEvent.Type;
export type SessionToolTurnEvent = typeof SessionToolTurnEvent.Type;
export type SessionTurn = typeof SessionTurn.Type;
export type SessionTurnEvent = typeof SessionTurnEvent.Type;
