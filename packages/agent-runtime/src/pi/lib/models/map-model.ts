import {getSupportedThinkingLevels} from "@earendil-works/pi-ai";
import type {Api, Model, ModelThinkingLevel} from "@earendil-works/pi-ai";
import type {ModelDetails} from "@supernova/contracts/services/sessions/schemas";

const thinkingLevelLabels: Record<ModelThinkingLevel, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
  max: "Max",
  minimal: "Minimal",
  off: "Off",
  xhigh: "Extra High",
};

function formatNativeThinkingLabel(level: ModelThinkingLevel, nativeLevel: string | null | undefined): string {
  if (!nativeLevel || nativeLevel === level) return thinkingLevelLabels[level];

  return nativeLevel
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function getThinkingLevelOptions(model: Model<Api>): ModelDetails["thinkingLevels"] {
  // Several canonical levels can map to one native value; show one option per native value.
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
