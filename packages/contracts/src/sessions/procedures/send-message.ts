import {Schema} from "effect";
import {ModelReference, SessionSummary, Turn, UserMessageContentPart} from "../schemas";

export const SendMessagePayload = Schema.Struct({
  contentParts: Schema.Array(UserMessageContentPart),
  model: ModelReference,
  sessionId: Schema.String,
});

/** Stream event emitted while sending a user message to a session. */
export const SendMessageEvent = Schema.Union([
  /** Terminal stream failure. */
  Schema.Struct({type: Schema.Literal("error"), error: Schema.String}),
  /** Incremental update for the active turn emitted while the agent is working. */
  Schema.Struct({type: Schema.Literal("turn"), turn: Turn, session: Schema.optional(SessionSummary)}),
  /** Initial transcript snapshot emitted before prompting starts. */
  Schema.Struct({type: Schema.Literal("ready"), turns: Schema.Array(Turn)}),
  /** Final authoritative transcript snapshot emitted after prompting completes. */
  Schema.Struct({type: Schema.Literal("done"), turns: Schema.Array(Turn)}),
]);

export type SendMessagePayload = typeof SendMessagePayload.Type;
export type SendMessageEvent = typeof SendMessageEvent.Type;
