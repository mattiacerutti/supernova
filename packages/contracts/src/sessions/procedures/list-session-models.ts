import {Schema} from "effect";
import {ModelDetails} from "../schemas";

export const SessionModelsListPayload = Schema.Void;

/** Result payload for listing models available to session prompts. */
export const SessionModelsListResult = Schema.Array(ModelDetails);

export class SessionModelsListError extends Schema.TaggedErrorClass<SessionModelsListError>()("SessionModelsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type SessionModelsListPayload = typeof SessionModelsListPayload.Type;
export type SessionModelsListResult = typeof SessionModelsListResult.Type;
