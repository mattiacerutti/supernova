import {obj, type Static, str} from "@earendil-works/chord";

export const ProviderLogoutPayload = obj({
  providerId: str(),
});

export const ProviderLogoutResult = obj({
  providerId: str(),
});

export type ProviderLogoutPayload = Static<typeof ProviderLogoutPayload>;
export type ProviderLogoutResult = Static<typeof ProviderLogoutResult>;
