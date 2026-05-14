import {Schema} from "effect";

/** Lifecycle state for a tool invocation. */
export const ToolStatus = Schema.Union([Schema.Literal("pending"), Schema.Literal("running"), Schema.Literal("completed"), Schema.Literal("error")]);

/** Metadata and result data for a tool invocation performed during a session turn. */
export const SessionTool = Schema.Struct({
  /** Stable tool identifier, for example "bash", "read", or "edit". */
  name: Schema.String,
  /** Short human-readable description of the tool action, for example "Ran command". */
  summary: Schema.String,
  /** Current execution state of the tool invocation. */
  status: ToolStatus,
  /** Tool-specific input payload. Modeled as a record because each tool defines its own input shape. */
  input: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  /** Tool output when execution completed successfully. */
  output: Schema.optional(Schema.String),
  /** Tool error message when execution failed. */
  error: Schema.optional(Schema.String),
});

export type ToolStatus = typeof ToolStatus.Type;
export type SessionTool = typeof SessionTool.Type;
