import {Schema} from "effect";
import {OutgoingMessage, SessionWorkspaceSelection} from "../schemas";

export const CreateSessionPayload = Schema.Struct({
  /** Client-chosen id for the new session; must be unused. The client mints it so the session can be shown before the server replies. */
  id: Schema.String,
  /** First message, started as the session's first turn. The session is removed again if it cannot start. */
  message: Schema.optional(OutgoingMessage),
  projectPath: Schema.String,
  /** Defaults to the project's own checkout. */
  workspace: Schema.optional(SessionWorkspaceSelection),
});

export class CreateSessionError extends Schema.TaggedErrorClass<CreateSessionError>()("CreateSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type CreateSessionPayload = typeof CreateSessionPayload.Type;
