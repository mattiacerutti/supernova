import type {IAgentModelDetails, IAgentModelReference} from "@pi-desktop/contracts/sessions";

const thinkingLevelRank: Record<string, number> = {
  off: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
};

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

export function resolveThinkingLevel(model: IAgentModelDetails, preferredThinkingLevel: string | undefined): string | undefined {
  const [first, ...rest] = model.thinkingLevels;
  if (first === undefined) return undefined;
  if (!preferredThinkingLevel) return first.value;
  if (model.thinkingLevels.some((level) => level.value === preferredThinkingLevel)) return preferredThinkingLevel;

  const preferredRank = thinkingLevelRank[preferredThinkingLevel];
  if (preferredRank === undefined) return first.value;

  let closestValue = first.value;
  let closestDistance = Math.abs((thinkingLevelRank[closestValue] ?? 0) - preferredRank);

  for (const option of rest) {
    const rank = thinkingLevelRank[option.value];
    if (rank === undefined) continue;

    const distance = Math.abs(rank - preferredRank);
    if (distance < closestDistance) {
      closestValue = option.value;
      closestDistance = distance;
    }
  }

  return closestValue;
}
