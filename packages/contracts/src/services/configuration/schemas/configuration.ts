import {z} from "zod";

const thinkingLevel = z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** Startup preferences for a new session; explicit selections and resumed sessions take precedence. */
export const ModelDefaults = z.object({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  thinkingLevel: thinkingLevel.optional(),
  modelThinkingLevels: z.record(z.string(), thinkingLevel).optional(),
});

/** Effective configuration safe to expose to clients. Backend-only settings never cross this boundary. */
export const Configuration = z.object({
  modelDefaults: ModelDefaults,
});

export type ModelDefaults = z.infer<typeof ModelDefaults>;
export type Configuration = z.infer<typeof Configuration>;
