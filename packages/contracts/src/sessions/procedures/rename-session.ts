import {Schema} from "effect";
import {Session} from "../schemas";

export const RenameSessionPayload = Schema.Struct({
  sessionId: Schema.String,
  title: Schema.String,
});

export const RenameSessionResult = Session;

export class RenameSessionError extends Schema.TaggedErrorClass<RenameSessionError>()("RenameSessionError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type RenameSessionPayload = typeof RenameSessionPayload.Type;
export type RenameSessionResult = typeof RenameSessionResult.Type;
