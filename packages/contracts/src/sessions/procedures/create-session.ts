import {Schema} from "effect";
import {Session} from "../schemas";

export const CreateSessionPayload = Schema.Struct({
  projectPath: Schema.String,
});

export const CreateSessionResult = Session;

export class CreateSessionError extends Schema.TaggedErrorClass<CreateSessionError>()("CreateSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type CreateSessionPayload = typeof CreateSessionPayload.Type;
export type CreateSessionResult = typeof CreateSessionResult.Type;
