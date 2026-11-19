import {arr, bool, int, lit, nul, obj, oneOf, opt, type Static, str, union} from "@earendil-works/chord";

/** `external`: managed outside Pi, never entered here. */
export const ProviderAuthType = oneOf("api_key", "oauth", "external");

export const ProviderAuthSource = oneOf("stored", "environment", "config", "runtime", "external", "unknown");

export const Provider = obj({
  id: str(),
  name: str(),
  source: opt(ProviderAuthSource),
  sourceLabel: opt(str()),
  authTypes: arr(ProviderAuthType),
  connected: bool(),
  disconnectable: bool(),
});

export const ProviderLoginAuthType = oneOf("api_key", "oauth");

const LoginOption = obj({id: str(), label: str(), description: opt(str())});

/** Answering closes it; the next question has a new `id`. */
export const LoginPrompt = union([
  obj({id: str(), type: lit("text"), message: str(), placeholder: opt(str())}),
  obj({id: str(), type: lit("secret"), message: str(), placeholder: opt(str())}),
  obj({id: str(), type: lit("select"), message: str(), options: arr(LoginOption)}),
  obj({id: str(), type: lit("manual_code"), message: str(), placeholder: opt(str())}),
]);

export const LoginNotice = union([
  obj({type: lit("info"), message: str(), links: opt(arr(obj({url: str(), label: opt(str())})))}),
  obj({type: lit("auth_url"), url: str(), instructions: opt(str())}),
  obj({type: lit("device_code"), userCode: str(), verificationUri: str(), expiresInSeconds: opt(int())}),
  obj({type: lit("progress"), message: str()}),
]);

/** Credentials never appear here. */
export const LoginState = obj({
  attemptId: str(),
  providerId: str(),
  authType: ProviderLoginAuthType,
  status: oneOf("working", "success", "cancelled", "error"),
  prompt: union([LoginPrompt, nul()]),
  notices: arr(LoginNotice),
  message: opt(str()),
});

export type ProviderAuthType = Static<typeof ProviderAuthType>;
export type ProviderAuthSource = Static<typeof ProviderAuthSource>;
export type Provider = Static<typeof Provider>;
export type ProviderLoginAuthType = Static<typeof ProviderLoginAuthType>;
export type LoginPrompt = Static<typeof LoginPrompt>;
export type LoginNotice = Static<typeof LoginNotice>;
export type LoginState = Static<typeof LoginState>;
