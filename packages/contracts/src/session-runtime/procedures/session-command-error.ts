import {Schema} from "effect";

/** A session command (send, compact) was rejected: unknown or unauthenticated model, busy or read-only session. */
export class SessionCommandError extends Schema.TaggedErrorClass<SessionCommandError>()("SessionCommandError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
