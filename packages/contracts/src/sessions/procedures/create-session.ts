import {Schema} from "effect";
import {SessionDetails} from "../schemas";

export const SessionCreatePayload = Schema.Struct({
  projectPath: Schema.String,
});

export const SessionCreateResult = SessionDetails;

export class SessionCreateError extends Schema.TaggedErrorClass<SessionCreateError>()("SessionCreateError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type SessionCreatePayload = typeof SessionCreatePayload.Type;
export type SessionCreateResult = typeof SessionCreateResult.Type;
