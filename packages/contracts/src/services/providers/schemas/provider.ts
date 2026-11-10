import {arr, bool, obj, oneOf, opt, type Static, str} from "@earendil-works/chord";

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

export type ProviderAuthType = Static<typeof ProviderAuthType>;
export type ProviderAuthSource = Static<typeof ProviderAuthSource>;
export type Provider = Static<typeof Provider>;
