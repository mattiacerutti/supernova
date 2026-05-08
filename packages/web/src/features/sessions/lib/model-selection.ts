import type {IAgentModelDetails, IAgentModelReference} from "@pi-desktop/contracts/sessions";

export function modelKey(provider: string, id: string): string {
  return `${provider}|${id}`;
}

export function selectionKey(selection: IAgentModelReference | undefined): string {
  return selection ? modelKey(selection.providerId, selection.id) : "";
}

export function selectionFromModel(model: IAgentModelDetails, thinkingLevel: string | undefined): IAgentModelReference {
  return {
    id: model.id,
    providerId: model.providerId,
    thinkingLevel,
  };
}

export function resolveThinkingLevel(model: IAgentModelDetails | undefined, preferredThinkingLevel: string | undefined): string | undefined {
  const thinkingLevels = model?.thinkingLevels ?? [];
  if (preferredThinkingLevel && thinkingLevels.some((level) => level.value === preferredThinkingLevel)) return preferredThinkingLevel;
  return thinkingLevels[0]?.value;
}
