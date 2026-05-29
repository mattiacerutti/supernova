import {Schema} from "effect";
import {Session, SessionSummary, Turn} from "@supernova/contracts/sessions/schemas";

export const WatchEventsPayload = Schema.Void;

/** Global stream event emitted by the server-owned session runtime. */
export const SessionStreamEvent = Schema.Union([
  Schema.Struct({type: Schema.Literal("connected")}),
  Schema.Struct({type: Schema.Literal("heartbeat"), timestamp: Schema.String}),
  Schema.Struct({type: Schema.Literal("session.agent.started"), revision: Schema.Number, sessionId: Schema.String}),
  Schema.Struct({type: Schema.Literal("session.agent.ended"), revision: Schema.Number, sessionId: Schema.String}),
  Schema.Struct({type: Schema.Literal("session.compaction.started"), revision: Schema.Number, sessionId: Schema.String}),
  Schema.Struct({type: Schema.Literal("session.compaction.ended"), revision: Schema.Number, sessionId: Schema.String, willContinue: Schema.Boolean}),
  Schema.Struct({type: Schema.Literal("session.turn"), revision: Schema.Number, sessionId: Schema.String, turn: Turn}),
  Schema.Struct({type: Schema.Literal("session.snapshot"), revision: Schema.Number, sessionId: Schema.String, session: Session}),
  Schema.Struct({type: Schema.Literal("session.updated"), revision: Schema.Number, sessionId: Schema.String, summary: SessionSummary}),
  Schema.Struct({type: Schema.Literal("session.error"), revision: Schema.Number, sessionId: Schema.String, error: Schema.String}),
  Schema.Struct({type: Schema.Literal("server.disposed")}),
]);

export type SessionStreamEvent = typeof SessionStreamEvent.Type;
export type WatchEventsPayload = typeof WatchEventsPayload.Type;
