import {Schema} from "effect";
import {AgentModelReference, AgentSessionAttachment, AgentSessionSummary, AgentSessionTurn} from "../schemas";

export const AgentSessionMessageSendPayload = Schema.Struct({
  attachments: Schema.Array(AgentSessionAttachment),
  message: Schema.String,
  model: AgentModelReference,
  sessionId: Schema.String,
});

/** Stream event emitted while sending a user message to a session. */
export const AgentSessionStreamEvent = Schema.Union([
  /** Terminal stream failure. */
  Schema.Struct({type: Schema.Literal("error"), error: Schema.String}),
  /** Incremental update for the active turn emitted while the agent is working. */
  Schema.Struct({type: Schema.Literal("turn"), turn: AgentSessionTurn, session: Schema.optional(AgentSessionSummary)}),
  /** Initial transcript snapshot emitted before prompting starts. */
  Schema.Struct({type: Schema.Literal("ready"), turns: Schema.Array(AgentSessionTurn)}),
  /** Final authoritative transcript snapshot emitted after prompting completes. */
  Schema.Struct({type: Schema.Literal("done"), turns: Schema.Array(AgentSessionTurn)}),
]);

export type AgentSessionMessageSendPayload = typeof AgentSessionMessageSendPayload.Type;
export type AgentSessionStreamEvent = typeof AgentSessionStreamEvent.Type;
