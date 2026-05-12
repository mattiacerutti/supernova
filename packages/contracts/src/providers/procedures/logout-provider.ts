import {Schema} from "effect";

export const AgentProviderLogoutPayload = Schema.Struct({
  providerId: Schema.String,
});

export const AgentProviderLogoutResult = Schema.Struct({
  providerId: Schema.String,
});

export class AgentProviderLogoutError extends Schema.TaggedErrorClass<AgentProviderLogoutError>()("AgentProviderLogoutError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type IAgentProviderLogoutPayload = typeof AgentProviderLogoutPayload.Type;
export type IAgentProviderLogoutResult = typeof AgentProviderLogoutResult.Type;
