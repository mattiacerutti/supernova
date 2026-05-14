import {Schema} from "effect";

export const ProviderApiKeySetPayload = Schema.Struct({
  apiKey: Schema.String,
  providerId: Schema.String,
});

export const ProviderApiKeySetResult = Schema.Struct({
  providerId: Schema.String,
});

export class ProviderApiKeySetError extends Schema.TaggedErrorClass<ProviderApiKeySetError>()("ProviderApiKeySetError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ProviderApiKeySetPayload = typeof ProviderApiKeySetPayload.Type;
export type ProviderApiKeySetResult = typeof ProviderApiKeySetResult.Type;
