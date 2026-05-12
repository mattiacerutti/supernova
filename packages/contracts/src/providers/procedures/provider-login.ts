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

export type IAgentProviderOAuthLoginStartPayload = typeof AgentProviderOAuthLoginStartPayload.Type;
export type IAgentProviderLoginSessionGetPayload = typeof AgentProviderLoginSessionGetPayload.Type;
export type IAgentProviderLoginInputSubmitPayload = typeof AgentProviderLoginInputSubmitPayload.Type;
export type IAgentProviderLoginCancelPayload = typeof AgentProviderLoginCancelPayload.Type;
export type IAgentProviderLoginResult = typeof AgentProviderLoginResult.Type;
