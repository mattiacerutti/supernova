import {Schema} from "effect";
import type {StateOp} from "@supernova/contracts/sessions/schemas";
import {PiJson, SessionSummary} from "@supernova/contracts/sessions/schemas";

export const WatchEventsPayload = Schema.Void;

/** A step of new-session setup long enough to show progress for. */
export const SessionSetupStep = Schema.Literals(["worktree"]);

/** What a session is doing, derived from its `pi.live`; sent with every delta so clients without the session see it too. */
export const SessionActivity = Schema.Literals(["idle", "running", "compacting"]);

/** Global stream event emitted by the server-owned session runtime. */
export const SessionStreamEvent = Schema.Union([
  Schema.Struct({type: Schema.Literal("connected")}),
  Schema.Struct({type: Schema.Literal("heartbeat"), timestamp: Schema.String}),
  Schema.Struct({type: Schema.Literal("session.setup.started"), revision: Schema.Number, sessionId: Schema.String, step: SessionSetupStep}),
  Schema.Struct({type: Schema.Literal("session.setup.ended"), revision: Schema.Number, sessionId: Schema.String, step: SessionSetupStep}),
  /** Chord delta from the session at `version - 1` to `version`. */
  Schema.Struct({
    type: Schema.Literal("session.state"),
    revision: Schema.Number,
    sessionId: Schema.String,
    version: Schema.Number,
    ops: PiJson<readonly StateOp[]>(),
    activity: SessionActivity,
  }),
  Schema.Struct({type: Schema.Literal("session.updated"), revision: Schema.Number, projectPath: Schema.String, sessionId: Schema.String, summary: SessionSummary}),
  Schema.Struct({type: Schema.Literal("session.error"), revision: Schema.Number, sessionId: Schema.String, error: Schema.String}),
  Schema.Struct({type: Schema.Literal("server.disposed")}),
]);

export type SessionActivity = typeof SessionActivity.Type;
export type SessionSetupStep = typeof SessionSetupStep.Type;
export type SessionStreamEvent = typeof SessionStreamEvent.Type;
export type WatchEventsPayload = typeof WatchEventsPayload.Type;
