import {Schema} from "effect";

export const AgentProviderAuthType = Schema.Union([Schema.Literal("api_key"), Schema.Literal("oauth"), Schema.Literal("external")]);
export type AgentProviderAuthType = typeof AgentProviderAuthType.Type;

export const AgentProviderAuthSource = Schema.Union([
  Schema.Literal("stored"),
  Schema.Literal("runtime"),
  Schema.Literal("environment"),
  Schema.Literal("fallback"),
  Schema.Literal("models_json_key"),
  Schema.Literal("models_json_command"),
]);
export type AgentProviderAuthSource = typeof AgentProviderAuthSource.Type;

export const AgentProvider = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  source: Schema.optional(AgentProviderAuthSource),
  sourceLabel: Schema.optional(Schema.String),
  authTypes: Schema.Array(AgentProviderAuthType),
  connected: Schema.Boolean,
  disconnectable: Schema.Boolean,
});
export type IAgentProvider = typeof AgentProvider.Type;

export const AgentProvidersListResult = Schema.Array(AgentProvider);
export type IAgentProvidersListResult = typeof AgentProvidersListResult.Type;

export class AgentProvidersListError extends Schema.TaggedErrorClass<AgentProvidersListError>()("AgentProvidersListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export const AgentProviderApiKeySetResult = Schema.Struct({
  providerId: Schema.String,
});
export type IAgentProviderApiKeySetResult = typeof AgentProviderApiKeySetResult.Type;

export class AgentProviderApiKeySetError extends Schema.TaggedErrorClass<AgentProviderApiKeySetError>()("AgentProviderApiKeySetError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export const AgentProviderLogoutResult = Schema.Struct({
  providerId: Schema.String,
});
export type IAgentProviderLogoutResult = typeof AgentProviderLogoutResult.Type;

export class AgentProviderLogoutError extends Schema.TaggedErrorClass<AgentProviderLogoutError>()("AgentProviderLogoutError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export const AgentProviderLoginStatus = Schema.Union([
  Schema.Literal("pending"),
  Schema.Literal("waiting_input"),
  Schema.Literal("authenticating"),
  Schema.Literal("succeeded"),
  Schema.Literal("failed"),
  Schema.Literal("cancelled"),
]);
export type AgentProviderLoginStatus = typeof AgentProviderLoginStatus.Type;

export const AgentProviderLoginInputKind = Schema.Union([Schema.Literal("prompt"), Schema.Literal("manual_code")]);
export type AgentProviderLoginInputKind = typeof AgentProviderLoginInputKind.Type;

export const AgentProviderLoginSession = Schema.Struct({
  allowEmptyInput: Schema.optional(Schema.Boolean),
  authUrl: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  inputKind: Schema.optional(AgentProviderLoginInputKind),
  instructions: Schema.optional(Schema.String),
  loginSessionId: Schema.String,
  placeholder: Schema.optional(Schema.String),
  progress: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  providerId: Schema.String,
  providerName: Schema.String,
  status: AgentProviderLoginStatus,
});
export type IAgentProviderLoginSession = typeof AgentProviderLoginSession.Type;

export class AgentProviderLoginError extends Schema.TaggedErrorClass<AgentProviderLoginError>()("AgentProviderLoginError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
