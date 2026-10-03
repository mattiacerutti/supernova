import {z} from "zod";
import {record, struct} from "@supernova/contracts/runtime/schemas";

const thinkingLevel = z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** Startup preferences for a new session; explicit selections and resumed sessions take precedence. */
export const ModelDefaults = struct({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  thinkingLevel: thinkingLevel.optional(),
  modelThinkingLevels: record(thinkingLevel).optional(),
});

/** Effective configuration safe to expose to clients. Backend-only settings never cross this boundary. */
export const Configuration = struct({
  modelDefaults: ModelDefaults,
});

export type ModelDefaults = z.infer<typeof ModelDefaults>;
export type Configuration = z.infer<typeof Configuration>;
