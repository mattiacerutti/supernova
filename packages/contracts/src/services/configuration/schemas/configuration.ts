import {map, obj, oneOf, opt, type Static, str} from "@earendil-works/chord";

const thinkingLevel = oneOf("off", "minimal", "low", "medium", "high", "xhigh", "max");

export const ModelDefaults = obj({
  providerId: opt(str()),
  modelId: opt(str()),
  thinkingLevel: opt(thinkingLevel),
  modelThinkingLevels: opt(map(thinkingLevel)),
});

export const Configuration = obj({
  modelDefaults: ModelDefaults,
});

export type ModelDefaults = Static<typeof ModelDefaults>;
export type Configuration = Static<typeof Configuration>;
