import type {AgentSession} from "@earendil-works/pi-coding-agent";

type PiAgentThinkingLevel = Parameters<AgentSession["setThinkingLevel"]>[0];

export const piThinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

const piThinkingLevelSet = new Set<string>(piThinkingLevels);

export function toPiThinkingLevel(value: string | undefined): PiAgentThinkingLevel {
  return value && piThinkingLevelSet.has(value) ? (value as PiAgentThinkingLevel) : "off";
}
