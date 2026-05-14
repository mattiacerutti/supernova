import {Schema} from "effect";
import {ModelReference, SessionAttachment, SessionSummary, SessionTurn} from "../schemas";

export const SessionMessageSendPayload = Schema.Struct({
  attachments: Schema.Array(SessionAttachment),
  message: Schema.String,
  model: ModelReference,
  sessionId: Schema.String,
});

/** Stream event emitted while sending a user message to a session. */
export const SessionStreamEvent = Schema.Union([
  /** Terminal stream failure. */
  Schema.Struct({type: Schema.Literal("error"), error: Schema.String}),
  /** Incremental update for the active turn emitted while the agent is working. */
  Schema.Struct({type: Schema.Literal("turn"), turn: SessionTurn, session: Schema.optional(SessionSummary)}),
  /** Initial transcript snapshot emitted before prompting starts. */
  Schema.Struct({type: Schema.Literal("ready"), turns: Schema.Array(SessionTurn)}),
  /** Final authoritative transcript snapshot emitted after prompting completes. */
  Schema.Struct({type: Schema.Literal("done"), turns: Schema.Array(SessionTurn)}),
]);

export type SessionMessageSendPayload = typeof SessionMessageSendPayload.Type;
export type SessionStreamEvent = typeof SessionStreamEvent.Type;
