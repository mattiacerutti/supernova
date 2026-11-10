import {arr, bool, obj, opt, type Static, str} from "@earendil-works/chord";

export const ModelReference = obj({
  id: str(),
  providerId: str(),
  thinkingLevel: opt(str()),
});

export const ThinkingLevelOption = obj({
  value: str(),
  label: str(),
});

export const ModelCapabilities = obj({
  images: bool(),
  reasoning: bool(),
});

export const ModelDetails = obj({
  id: str(),
  name: str(),
  capabilities: ModelCapabilities,
  providerId: str(),
  providerName: str(),
  thinkingLevels: arr(ThinkingLevelOption),
});

export type ModelReference = Static<typeof ModelReference>;
export type ThinkingLevelOption = Static<typeof ThinkingLevelOption>;
export type ModelCapabilities = Static<typeof ModelCapabilities>;
export type ModelDetails = Static<typeof ModelDetails>;
