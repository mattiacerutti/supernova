import {Schema} from "effect";
import {AgentProvider} from "../schemas";

export const AgentProvidersListPayload = Schema.Void;

export const AgentProvidersListResult = Schema.Array(AgentProvider);

export class AgentProvidersListError extends Schema.TaggedErrorClass<AgentProvidersListError>()("AgentProvidersListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentProvidersListPayload = typeof AgentProvidersListPayload.Type;
export type AgentProvidersListResult = typeof AgentProvidersListResult.Type;
