import {Schema} from "effect";
import {OutgoingMessage, Session} from "../schemas";

export const CreateSessionPayload = Schema.Struct({
  /** Client-chosen id for the new session; must be unused. The server generates one when omitted. */
  id: Schema.optional(Schema.String),
  /** First message, started as the session's first turn. The session is removed again if it cannot start. */
  message: Schema.optional(OutgoingMessage),
  projectPath: Schema.String,
});

export const CreateSessionResult = Session;

export class CreateSessionError extends Schema.TaggedErrorClass<CreateSessionError>()("CreateSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type CreateSessionPayload = typeof CreateSessionPayload.Type;
export type CreateSessionResult = typeof CreateSessionResult.Type;
