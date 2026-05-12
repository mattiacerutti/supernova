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

export type AgentProviderApiKeySetPayload = typeof AgentProviderApiKeySetPayload.Type;
export type AgentProviderApiKeySetResult = typeof AgentProviderApiKeySetResult.Type;
