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
export type IAgentModelReference = typeof AgentModelReference.Type;

/** Lifecycle state for a tool invocation. */
export const AgentToolStatus = Schema.Union([Schema.Literal("pending"), Schema.Literal("running"), Schema.Literal("completed"), Schema.Literal("error")]);
export type AgentToolStatus = typeof AgentToolStatus.Type;

/** Metadata and result data for a tool invocation performed during a session turn. */
export const AgentSessionTool = Schema.Struct({
  /** Stable tool identifier, for example "bash", "read", or "edit". */
  name: Schema.String,
  /** Short human-readable description of the tool action, for example "Ran command". */
  summary: Schema.String,
  /** Current execution state of the tool invocation. */
  status: AgentToolStatus,
  /** Tool-specific input payload. Modeled as a record because each tool defines its own input shape. */
  input: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  /** Tool output when execution completed successfully. */
  output: Schema.optional(Schema.String),
  /** Tool error message when execution failed. */
  error: Schema.optional(Schema.String),
});
export type IAgentSessionTool = typeof AgentSessionTool.Type;

/** Assistant response content produced during a turn. */
export const AgentSessionAssistantTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** Assistant-visible response text. */
  content: Schema.String,
  /** Event duration in milliseconds, when provided by the runtime. */
  durationMs: Schema.optional(Schema.Number),
  /** Assistant or provider error associated with this response event. */
  error: Schema.optional(Schema.String),
  /** ISO timestamp for when the event started or was created. */
  timestamp: Schema.String,
  type: Schema.Literal("assistant"),
});
export type IAgentSessionAssistantTurnEvent = typeof AgentSessionAssistantTurnEvent.Type;

/** Internal reasoning or thinking content produced by the model during a turn. */
export const AgentSessionReasoningTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** Reasoning text emitted by the model. */
  content: Schema.String,
  /** Event duration in milliseconds, when provided by the runtime. */
  durationMs: Schema.optional(Schema.Number),
  /** ISO timestamp for when the event started or was created. */
  timestamp: Schema.String,
  type: Schema.Literal("reasoning"),
});
export type IAgentSessionReasoningTurnEvent = typeof AgentSessionReasoningTurnEvent.Type;

/** Tool invocation event produced during a turn. */
export const AgentSessionToolTurnEvent = Schema.Struct({
  /** Stable event identifier. */
  id: Schema.String,
  /** Event duration in milliseconds, when provided by the runtime. */
  durationMs: Schema.optional(Schema.Number),
  /** ISO timestamp for when the event started or was created. */
  timestamp: Schema.String,
  /** Tool metadata, input, output, and status. */
  tool: Schema.optional(AgentSessionTool),
  type: Schema.Literal("tool"),
});
export type IAgentSessionToolTurnEvent = typeof AgentSessionToolTurnEvent.Type;

/** Any non-user event that can occur within a session turn. */
export const AgentSessionTurnEvent = Schema.Union([AgentSessionAssistantTurnEvent, AgentSessionReasoningTurnEvent, AgentSessionToolTurnEvent]);
export type IAgentSessionTurnEvent = typeof AgentSessionTurnEvent.Type;

/** User-authored message that starts a session turn. */
export const AgentSessionUserMessage = Schema.Struct({
  /** Stable message identifier. */
  id: Schema.String,
  /** User-authored text content. */
  content: Schema.String,
  /** ISO timestamp for when the message was sent or created. */
  timestamp: Schema.optional(Schema.String),
});
export type IAgentSessionUserMessage = typeof AgentSessionUserMessage.Type;

/** A single user request and all agent activity produced in response. */
export const AgentSessionTurn = Schema.Struct({
  /** Stable turn identifier. */
  id: Schema.String,
  /** Current lifecycle state of the turn. */
  status: Schema.Union([Schema.Literal("completed"), Schema.Literal("error"), Schema.Literal("streaming")]),
  /** Model configuration used for this turn. */
  model: AgentModelReference,
  /** User message that initiated the turn. */
  userMessage: AgentSessionUserMessage,
  /** Ordered assistant, reasoning, and tool events produced for the turn. */
  events: Schema.Array(AgentSessionTurnEvent),
  /** ISO timestamp for when the turn started. */
  startedAt: Schema.optional(Schema.String),
  /** ISO timestamp for when the turn completed or errored, when known. */
  completedAt: Schema.optional(Schema.String),
});
export type IAgentSessionTurn = typeof AgentSessionTurn.Type;

/** Full session transcript and metadata. */
export const AgentSessionDetails = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Human-readable session title. */
  title: Schema.String,
  /** Current session model configuration, when the runtime exposes one. */
  model: Schema.optional(AgentModelReference),
  /** Absolute path of the project/workspace associated with the session. */
  projectPath: Schema.String,
  /** Ordered session transcript represented as turns. */
  turns: Schema.Array(AgentSessionTurn),
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
});
export type IAgentSessionDetails = typeof AgentSessionDetails.Type;

/** Minimal session metadata used when listing sessions. */
export const AgentSessionSummary = Schema.Struct({
  /** Stable session identifier. */
  id: Schema.String,
  /** Human-readable session title. */
  title: Schema.String,
  /** ISO timestamp for the last session update. */
  updatedAt: Schema.String,
});
export type IAgentSessionSummary = typeof AgentSessionSummary.Type;

/** Selectable thinking or reasoning level supported by a model. */
export const AgentThinkingLevelOption = Schema.Struct({
  /** Provider-native value sent back when this level is selected, for example "off" or "high". */
  value: Schema.String,
  /** Human-readable label displayed in the UI. */
  label: Schema.String,
});
export type IAgentThinkingLevelOption = typeof AgentThinkingLevelOption.Type;

/** Feature capabilities advertised for a model. */
export const AgentModelCapabilities = Schema.Struct({
  /** Whether the model supports non-text attachments, such as images or files. */
  attachments: Schema.Boolean,
  /** Whether the model supports explicit thinking or reasoning modes. */
  reasoning: Schema.Boolean,
  /** Whether the model can request tool calls. */
  toolCalls: Schema.Boolean,
});
export type IAgentModelCapabilities = typeof AgentModelCapabilities.Type;

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
export type IAgentModelDetails = typeof AgentModelDetails.Type;

/** Stream event emitted while sending a user message to a session. */
export const AgentSessionStreamEvent = Schema.Union([
  /** Terminal stream failure. */
  Schema.Struct({type: Schema.Literal("error"), error: Schema.String}),
  /** Incremental update for the active turn emitted while the agent is working. */
  Schema.Struct({type: Schema.Literal("turn"), turn: AgentSessionTurn, session: Schema.optional(AgentSessionSummary)}),
  /** Initial transcript snapshot emitted before prompting starts. */
  Schema.Struct({type: Schema.Literal("ready"), turns: Schema.Array(AgentSessionTurn)}),
  /** Final authoritative transcript snapshot emitted after prompting completes. */
  Schema.Struct({type: Schema.Literal("done"), turns: Schema.Array(AgentSessionTurn)}),
]);
export type AgentSessionStreamEvent = typeof AgentSessionStreamEvent.Type;

/** Result payload for listing models available to session prompts. */
export const AgentSessionModelsListResult = Schema.Array(AgentModelDetails);
export type IAgentSessionModelsListResult = typeof AgentSessionModelsListResult.Type;

export class AgentSessionLoadError extends Schema.TaggedErrorClass<AgentSessionLoadError>()("AgentSessionLoadError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export class AgentSessionModelsListError extends Schema.TaggedErrorClass<AgentSessionModelsListError>()("AgentSessionModelsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
