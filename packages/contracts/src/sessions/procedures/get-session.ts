import {Schema} from "effect";

export const GetSessionPayload = Schema.Struct({
  sessionId: Schema.String,
});

export class LoadSessionError extends Schema.TaggedErrorClass<LoadSessionError>()("LoadSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type GetSessionPayload = typeof GetSessionPayload.Type;
