import {Schema} from "effect";

export const AgentProviderAuthType = Schema.Union([Schema.Literal("api_key"), Schema.Literal("oauth"), Schema.Literal("external")]);

export const AgentProviderAuthSource = Schema.Union([
  Schema.Literal("stored"),
  Schema.Literal("environment"),
  Schema.Literal("config"),
  Schema.Literal("runtime"),
  Schema.Literal("external"),
  Schema.Literal("unknown"),
]);

export const AgentProvider = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  source: Schema.optional(AgentProviderAuthSource),
  sourceLabel: Schema.optional(Schema.String),
  authTypes: Schema.Array(AgentProviderAuthType),
  connected: Schema.Boolean,
  disconnectable: Schema.Boolean,
});

export type AgentProviderAuthType = typeof AgentProviderAuthType.Type;
export type AgentProviderAuthSource = typeof AgentProviderAuthSource.Type;
export type AgentProvider = typeof AgentProvider.Type;
