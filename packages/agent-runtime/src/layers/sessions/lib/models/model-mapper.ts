import {getSupportedThinkingLevels} from "@earendil-works/pi-ai";
import type {Api, Model, ModelThinkingLevel} from "@earendil-works/pi-ai";
import type {ModelDetails} from "@supernova/contracts/sessions/schemas";

const thinkingLevelLabels: Record<ModelThinkingLevel, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
  minimal: "Minimal",
  off: "Off",
  xhigh: "Extra High",
};

/** Formats provider-native thinking levels into human-readable labels. */
function formatNativeThinkingLabel(level: ModelThinkingLevel, nativeLevel: string | null | undefined): string {
  if (!nativeLevel) return thinkingLevelLabels[level];

  return nativeLevel
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Returns deduplicated thinking-level options for a Pi model. */
function getThinkingLevelOptions(model: Model<Api>): ModelDetails["thinkingLevels"] {
  // Pi exposes canonical thinking levels, but provider metadata can map several
  // of them to the same native value. Show only one option per native value so
  // the UI does not offer duplicate choices that behave identically.
  const deduped = new Map<string, ModelDetails["thinkingLevels"][number]>();

  for (const level of getSupportedThinkingLevels(model)) {
    const nativeLevel = model.thinkingLevelMap?.[level] ?? level;
    const previous = deduped.get(nativeLevel);
    const option = {
      label: formatNativeThinkingLabel(level, nativeLevel),
      value: level,
    };

    if (!previous || level === nativeLevel) {
      deduped.set(nativeLevel, option);
    }
  }

  return Array.from(deduped.values());
}

/** Maps a Pi model definition into the shared model details contract. */
export function toAgentModelDetails(model: Model<Api>, providerDisplayName: string): ModelDetails {
  return {
    capabilities: {
      images: model.input.includes("image"),
      reasoning: model.reasoning === true,
    },
    id: model.id,
    name: model.name,
    providerId: model.provider,
    providerName: providerDisplayName,
    thinkingLevels: getThinkingLevelOptions(model),
  };
}
