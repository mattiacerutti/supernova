import {Schema} from "effect";
import {Session} from "../schemas";

export const GetSessionPayload = Schema.Struct({
  sessionId: Schema.String,
});

export const GetSessionResult = Session;

export class LoadSessionError extends Schema.TaggedErrorClass<LoadSessionError>()("LoadSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type GetSessionPayload = typeof GetSessionPayload.Type;
export type GetSessionResult = typeof GetSessionResult.Type;
