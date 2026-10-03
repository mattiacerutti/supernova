import {Schema} from "effect";

export const RenameSessionPayload = Schema.Struct({
  sessionId: Schema.String,
  title: Schema.String,
});

export class RenameSessionError extends Schema.TaggedErrorClass<RenameSessionError>()("RenameSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type RenameSessionPayload = typeof RenameSessionPayload.Type;
