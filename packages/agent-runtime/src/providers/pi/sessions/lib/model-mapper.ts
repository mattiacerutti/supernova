import {getSupportedThinkingLevels} from "@mariozechner/pi-ai";
import type {Api, Model, ModelThinkingLevel} from "@mariozechner/pi-ai";
import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions";

const thinkingLevelLabels: Record<ModelThinkingLevel, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
  minimal: "Minimal",
  off: "Off",
  xhigh: "Extra High",
};

function formatNativeThinkingLabel(level: ModelThinkingLevel, nativeLevel: string | null | undefined): string {
  if (nativeLevel === null) return thinkingLevelLabels[level];
  if (!nativeLevel) return thinkingLevelLabels[level];

  return nativeLevel
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toAgentModelDetails(model: Model<Api>, providerDisplayName: string): IAgentModelDetails {
  const thinkingLevels = getSupportedThinkingLevels(model).map((level) => ({
    label: formatNativeThinkingLabel(level, model.thinkingLevelMap?.[level]),
    value: level,
  }));

  return {
    capabilities: {
      attachments: true,
      reasoning: model.reasoning === true,
      toolCalls: true,
    },
    displayName: `${model.name} - ${providerDisplayName}`,
    id: model.id,
    name: model.name,
    providerId: model.provider,
    providerName: providerDisplayName,
    thinkingLevels,
  };
}
