import {Schema} from "effect";
import {AgentProviderLoginSession} from "../schemas";

export const AgentProviderOAuthLoginStartPayload = Schema.Struct({
  providerId: Schema.String,
});

export const AgentProviderLoginSessionGetPayload = Schema.Struct({
  loginSessionId: Schema.String,
});

export const AgentProviderLoginInputSubmitPayload = Schema.Struct({
  input: Schema.String,
  loginSessionId: Schema.String,
});

export const AgentProviderLoginCancelPayload = Schema.Struct({
  loginSessionId: Schema.String,
});

export const AgentProviderLoginResult = AgentProviderLoginSession;

export class AgentProviderLoginError extends Schema.TaggedErrorClass<AgentProviderLoginError>()("AgentProviderLoginError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentProviderOAuthLoginStartPayload = typeof AgentProviderOAuthLoginStartPayload.Type;
export type AgentProviderLoginSessionGetPayload = typeof AgentProviderLoginSessionGetPayload.Type;
export type AgentProviderLoginInputSubmitPayload = typeof AgentProviderLoginInputSubmitPayload.Type;
export type AgentProviderLoginCancelPayload = typeof AgentProviderLoginCancelPayload.Type;
export type AgentProviderLoginResult = typeof AgentProviderLoginResult.Type;
