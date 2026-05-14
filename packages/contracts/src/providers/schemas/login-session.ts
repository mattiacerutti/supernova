import {Schema} from "effect";

export const ProviderLoginStatus = Schema.Union([
  Schema.Literal("pending"),
  Schema.Literal("waiting_input"),
  Schema.Literal("authenticating"),
  Schema.Literal("succeeded"),
  Schema.Literal("failed"),
  Schema.Literal("cancelled"),
]);

export const ProviderLoginInputKind = Schema.Union([Schema.Literal("prompt"), Schema.Literal("manual_code")]);

export const ProviderLoginSession = Schema.Struct({
  allowEmptyInput: Schema.optional(Schema.Boolean),
  authUrl: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  inputKind: Schema.optional(ProviderLoginInputKind),
  instructions: Schema.optional(Schema.String),
  loginSessionId: Schema.String,
  placeholder: Schema.optional(Schema.String),
  progress: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  providerId: Schema.String,
  providerName: Schema.String,
  status: ProviderLoginStatus,
});

export type ProviderLoginStatus = typeof ProviderLoginStatus.Type;
export type ProviderLoginInputKind = typeof ProviderLoginInputKind.Type;
export type ProviderLoginSession = typeof ProviderLoginSession.Type;
