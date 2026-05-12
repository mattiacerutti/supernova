import {Schema} from "effect";

export const AgentProviderApiKeySetPayload = Schema.Struct({
  apiKey: Schema.String,
  providerId: Schema.String,
});

export const AgentProviderApiKeySetResult = Schema.Struct({
  providerId: Schema.String,
});

export class AgentProviderApiKeySetError extends Schema.TaggedErrorClass<AgentProviderApiKeySetError>()("AgentProviderApiKeySetError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type IAgentProviderApiKeySetPayload = typeof AgentProviderApiKeySetPayload.Type;
export type IAgentProviderApiKeySetResult = typeof AgentProviderApiKeySetResult.Type;
