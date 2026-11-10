import {arr, bool, lit, num, obj, opt, type Static, str, union} from "@earendil-works/chord";

export const ProviderLoginTextInput = obj({
  message: str(),
  placeholder: opt(str()),
  secret: opt(bool()),
});

const ProviderLoginInfoLink = obj({
  label: opt(str()),
  url: str(),
});

const ProviderLoginSelectOption = obj({
  description: opt(str()),
  id: str(),
  label: str(),
});

export const ProviderLoginStep = union([
  obj({type: lit("starting")}),
  obj({type: lit("authenticating")}),
  obj({type: lit("info"), links: arr(ProviderLoginInfoLink), message: str()}),
  obj({type: lit("select"), message: str(), options: arr(ProviderLoginSelectOption)}),
  obj({type: lit("browser_auth"), authUrl: str(), instructions: opt(str()), manualInput: opt(ProviderLoginTextInput)}),
  obj({
    type: lit("device_code"),
    expiresInSeconds: opt(num()),
    intervalSeconds: opt(num()),
    userCode: str(),
    verificationUri: str(),
  }),
  obj({type: lit("prompt"), input: ProviderLoginTextInput}),
  obj({type: lit("succeeded")}),
  obj({type: lit("failed"), error: str()}),
  obj({type: lit("cancelled")}),
]);

export const ProviderLoginSession = obj({
  loginSessionId: str(),
  progress: opt(str()),
  providerId: str(),
  step: ProviderLoginStep,
});

export type ProviderLoginTextInput = Static<typeof ProviderLoginTextInput>;
export type ProviderLoginStep = Static<typeof ProviderLoginStep>;
export type ProviderLoginSession = Static<typeof ProviderLoginSession>;
