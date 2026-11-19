import {obj, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";
import {ProviderLoginAuthType} from "@supernova/contracts/services/providers/schemas";

export const ProviderLoginStartPayload = obj({
  authType: ProviderLoginAuthType,
  providerId: str(),
});

export const ProviderLoginStartResult = obj({
  attemptId: str(),
});

export const ProviderLoginAnswerPayload = obj({
  attemptId: str(),
  promptId: str(),
  value: str({max: 100_000}),
});

export const ProviderLoginAttemptPayload = obj({
  attemptId: str(),
});

export const ProviderLogoutPayload = obj({
  providerId: str(),
});

export class ProviderLoginError extends TaggedError("ProviderLoginError") {}

export type ProviderLoginStartPayload = Static<typeof ProviderLoginStartPayload>;
export type ProviderLoginStartResult = Static<typeof ProviderLoginStartResult>;
export type ProviderLoginAnswerPayload = Static<typeof ProviderLoginAnswerPayload>;
export type ProviderLoginAttemptPayload = Static<typeof ProviderLoginAttemptPayload>;
export type ProviderLogoutPayload = Static<typeof ProviderLogoutPayload>;
