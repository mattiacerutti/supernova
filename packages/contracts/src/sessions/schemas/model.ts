import {Schema} from "effect";

/** Identifies a model configuration selected by the user or used to produce a session event. */
export const AgentModelReference = Schema.Struct({
  /** Provider-scoped model identifier. */
  id: Schema.String,
  /** Identifier of the provider that owns the model. */
  providerId: Schema.String,
  /** Provider-native thinking or reasoning level used with the model, when applicable. */
  thinkingLevel: Schema.optional(Schema.String),
});

/** Selectable thinking or reasoning level supported by a model. */
export const AgentThinkingLevelOption = Schema.Struct({
  /** Provider-native value sent back when this level is selected, for example "off" or "high". */
  value: Schema.String,
  /** Human-readable label displayed in the UI. */
  label: Schema.String,
});

/** Feature capabilities advertised for a model. */
export const AgentModelCapabilities = Schema.Struct({
  /** Whether the model supports native image inputs. Text attachments are converted to prompt context. */
  images: Schema.Boolean,
  /** Whether the model supports explicit thinking or reasoning modes. */
  reasoning: Schema.Boolean,
});

/** Rich model metadata used to populate model selection UI. */
export const AgentModelDetails = Schema.Struct({
  /** Provider-scoped model identifier. */
  id: Schema.String,
  /** Provider-supplied model name, for example "GPT 5.5". */
  name: Schema.String,
  /** Model feature capabilities. */
  capabilities: AgentModelCapabilities,
  /** Identifier of the provider that owns the model. */
  providerId: Schema.String,
  /** Human-readable provider name. */
  providerName: Schema.String,
  /** Thinking or reasoning levels supported by the model. */
  thinkingLevels: Schema.Array(AgentThinkingLevelOption),
});

export type AgentModelReference = typeof AgentModelReference.Type;
export type AgentThinkingLevelOption = typeof AgentThinkingLevelOption.Type;
export type AgentModelCapabilities = typeof AgentModelCapabilities.Type;
export type AgentModelDetails = typeof AgentModelDetails.Type;
