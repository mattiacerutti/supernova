import {Schema} from "effect";

export const ProviderLogoutPayload = Schema.Struct({
  providerId: Schema.String,
});

export const ProviderLogoutResult = Schema.Struct({
  providerId: Schema.String,
});

export class ProviderLogoutError extends Schema.TaggedErrorClass<ProviderLogoutError>()("ProviderLogoutError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ProviderLogoutPayload = typeof ProviderLogoutPayload.Type;
export type ProviderLogoutResult = typeof ProviderLogoutResult.Type;
