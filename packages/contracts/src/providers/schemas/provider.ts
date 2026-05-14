import {Schema} from "effect";

export const ProviderAuthType = Schema.Union([Schema.Literal("api_key"), Schema.Literal("oauth"), Schema.Literal("external")]);

export const ProviderAuthSource = Schema.Union([
  Schema.Literal("stored"),
  Schema.Literal("environment"),
  Schema.Literal("config"),
  Schema.Literal("runtime"),
  Schema.Literal("external"),
  Schema.Literal("unknown"),
]);

export const Provider = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  source: Schema.optional(ProviderAuthSource),
  sourceLabel: Schema.optional(Schema.String),
  authTypes: Schema.Array(ProviderAuthType),
  connected: Schema.Boolean,
  disconnectable: Schema.Boolean,
});

export type ProviderAuthType = typeof ProviderAuthType.Type;
export type ProviderAuthSource = typeof ProviderAuthSource.Type;
export type Provider = typeof Provider.Type;
