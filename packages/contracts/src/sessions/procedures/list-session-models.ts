import {Schema} from "effect";
import {AgentModelDetails} from "../schemas";

export const AgentSessionModelsListPayload = Schema.Void;

/** Result payload for listing models available to session prompts. */
export const AgentSessionModelsListResult = Schema.Array(AgentModelDetails);

export class AgentSessionModelsListError extends Schema.TaggedErrorClass<AgentSessionModelsListError>()("AgentSessionModelsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentSessionModelsListPayload = typeof AgentSessionModelsListPayload.Type;
export type AgentSessionModelsListResult = typeof AgentSessionModelsListResult.Type;
