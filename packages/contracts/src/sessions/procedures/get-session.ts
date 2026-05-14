import {Schema} from "effect";
import {SessionDetails} from "../schemas";

export const SessionGetPayload = Schema.Struct({
  sessionId: Schema.String,
});

export const SessionGetResult = SessionDetails;

export class SessionLoadError extends Schema.TaggedErrorClass<SessionLoadError>()("SessionLoadError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type SessionGetPayload = typeof SessionGetPayload.Type;
export type SessionGetResult = typeof SessionGetResult.Type;
