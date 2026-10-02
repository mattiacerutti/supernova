import type {ModelThinkingLevel} from "@earendil-works/pi-ai";

const piThinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly ModelThinkingLevel[];

const piThinkingLevelSet = new Set<string>(piThinkingLevels);

/** Converts an optional UI thinking-level value into a Pi thinking level. */
export function toPiThinkingLevel(value: string | undefined): ModelThinkingLevel {
  return value && piThinkingLevelSet.has(value) ? (value as ModelThinkingLevel) : "off";
}
