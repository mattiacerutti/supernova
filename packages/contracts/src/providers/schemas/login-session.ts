import {Schema} from "effect";

export const AgentProviderLoginStatus = Schema.Union([
  Schema.Literal("pending"),
  Schema.Literal("waiting_input"),
  Schema.Literal("authenticating"),
  Schema.Literal("succeeded"),
  Schema.Literal("failed"),
  Schema.Literal("cancelled"),
]);

export const AgentProviderLoginInputKind = Schema.Union([Schema.Literal("prompt"), Schema.Literal("manual_code")]);

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

export type AgentProviderLoginStatus = typeof AgentProviderLoginStatus.Type;
export type AgentProviderLoginInputKind = typeof AgentProviderLoginInputKind.Type;
export type AgentProviderLoginSession = typeof AgentProviderLoginSession.Type;
