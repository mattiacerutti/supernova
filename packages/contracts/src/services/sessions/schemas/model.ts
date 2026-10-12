import {z} from "zod";

/** Identifies a model configuration selected by the user or used to produce a session event. */
export const ModelReference = z.object({
  /** Provider-scoped model identifier. */
  id: z.string(),
  /** Identifier of the provider that owns the model. */
  providerId: z.string(),
  /** Provider-native thinking or reasoning level used with the model, when applicable. */
  thinkingLevel: z.string().optional(),
});

/** Selectable thinking or reasoning level supported by a model. */
export const ThinkingLevelOption = z.object({
  /** Provider-native value sent back when this level is selected, for example "off" or "high". */
  value: z.string(),
  /** Human-readable label displayed in the UI. */
  label: z.string(),
});

/** Feature capabilities advertised for a model. */
export const ModelCapabilities = z.object({
  /** Whether the model supports native image inputs. Text attachments are converted to prompt context. */
  images: z.boolean(),
  /** Whether the model supports explicit thinking or reasoning modes. */
  reasoning: z.boolean(),
});

/** Rich model metadata used to populate model selection UI. */
export const ModelDetails = z.object({
  /** Provider-scoped model identifier. */
  id: z.string(),
  /** Provider-supplied model name, for example "GPT 5.5". */
  name: z.string(),
  /** Model feature capabilities. */
  capabilities: ModelCapabilities,
  /** Identifier of the provider that owns the model. */
  providerId: z.string(),
  /** Human-readable provider name. */
  providerName: z.string(),
  /** Thinking or reasoning levels supported by the model. */
  thinkingLevels: z.array(ThinkingLevelOption),
});

export type ModelReference = z.infer<typeof ModelReference>;
export type ThinkingLevelOption = z.infer<typeof ThinkingLevelOption>;
export type ModelCapabilities = z.infer<typeof ModelCapabilities>;
export type ModelDetails = z.infer<typeof ModelDetails>;
