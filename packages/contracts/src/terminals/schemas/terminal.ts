import {Schema} from "effect";

/** A shell the server runs for a session, in the session's workspace. */
export const Terminal = Schema.Struct({
  /** Working directory the shell started in. */
  cwd: Schema.String,
  /** Exit code once the shell has exited; the terminal stays listed until it is closed. */
  exitCode: Schema.optional(Schema.Number),
  id: Schema.String,
  sessionId: Schema.String,
});

/** Events of one terminal, streamed to attached clients. */
export const TerminalEvent = Schema.Union([
  /** Output since the shell started, capped; sent once on attach. */
  Schema.Struct({type: Schema.Literal("terminal.history"), data: Schema.String}),
  Schema.Struct({type: Schema.Literal("terminal.output"), data: Schema.String}),
  Schema.Struct({type: Schema.Literal("terminal.exited"), exitCode: Schema.Number}),
  /** The terminal was closed and no longer exists. */
  Schema.Struct({type: Schema.Literal("terminal.closed")}),
]);

export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()("TerminalError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export class TerminalNotFoundError extends Schema.TaggedErrorClass<TerminalNotFoundError>()("TerminalNotFoundError", {
  message: Schema.String,
}) {}

export type Terminal = typeof Terminal.Type;
export type TerminalEvent = typeof TerminalEvent.Type;
