import {z} from "zod";

export const ModelReference = z.object({
  id: z.string(),
  providerId: z.string(),
  thinkingLevel: z.string().optional(),
});

export const ThinkingLevelOption = z.object({
  value: z.string(),
  label: z.string(),
});

export const ModelCapabilities = z.object({
  /** Without it, image attachments are refused; text attachments become prompt context either way. */
  images: z.boolean(),
  reasoning: z.boolean(),
});

export const ModelDetails = z.object({
  id: z.string(),
  name: z.string(),
  capabilities: ModelCapabilities,
  providerId: z.string(),
  providerName: z.string(),
  thinkingLevels: z.array(ThinkingLevelOption),
});

export type ModelReference = z.infer<typeof ModelReference>;
export type ThinkingLevelOption = z.infer<typeof ThinkingLevelOption>;
export type ModelCapabilities = z.infer<typeof ModelCapabilities>;
export type ModelDetails = z.infer<typeof ModelDetails>;
