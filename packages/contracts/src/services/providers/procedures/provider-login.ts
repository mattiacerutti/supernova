import {obj, oneOf, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";
import {ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";

export const ProviderLoginAuthType = oneOf("api_key", "oauth");

export const ProviderLoginStartPayload = obj({
  authType: ProviderLoginAuthType,
  providerId: str(),
});

export const ProviderLoginInputSubmitPayload = obj({
  input: str(),
  loginSessionId: str(),
});

export const ProviderLoginCancelPayload = obj({
  loginSessionId: str(),
});

export const ProviderLoginResult = ProviderLoginSession;

export class ProviderLoginError extends TaggedError("ProviderLoginError") {}

export type ProviderLoginAuthType = Static<typeof ProviderLoginAuthType>;
export type ProviderLoginStartPayload = Static<typeof ProviderLoginStartPayload>;
export type ProviderLoginInputSubmitPayload = Static<typeof ProviderLoginInputSubmitPayload>;
export type ProviderLoginCancelPayload = Static<typeof ProviderLoginCancelPayload>;
export type ProviderLoginResult = Static<typeof ProviderLoginResult>;
