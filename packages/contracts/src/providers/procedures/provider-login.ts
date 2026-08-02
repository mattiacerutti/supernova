import {Schema} from "effect";
import {ProviderLoginSession} from "../schemas";

export const ProviderLoginAuthType = Schema.Union([Schema.Literal("api_key"), Schema.Literal("oauth")]);

export const ProviderLoginStartPayload = Schema.Struct({
  authType: ProviderLoginAuthType,
  providerId: Schema.String,
});

export const ProviderLoginInputSubmitPayload = Schema.Struct({
  input: Schema.String,
  loginSessionId: Schema.String,
});

export const ProviderLoginCancelPayload = Schema.Struct({
  loginSessionId: Schema.String,
});

export const ProviderLoginWatchPayload = Schema.Struct({
  loginSessionId: Schema.String,
});

export const ProviderLoginResult = ProviderLoginSession;

export class ProviderLoginError extends Schema.TaggedErrorClass<ProviderLoginError>()("ProviderLoginError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ProviderLoginAuthType = typeof ProviderLoginAuthType.Type;
export type ProviderLoginStartPayload = typeof ProviderLoginStartPayload.Type;
export type ProviderLoginInputSubmitPayload = typeof ProviderLoginInputSubmitPayload.Type;
export type ProviderLoginCancelPayload = typeof ProviderLoginCancelPayload.Type;
export type ProviderLoginWatchPayload = typeof ProviderLoginWatchPayload.Type;
export type ProviderLoginResult = typeof ProviderLoginResult.Type;
