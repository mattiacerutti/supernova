import {Schema} from "effect";

/** Lifecycle state for a tool invocation. */
export const ToolStatus = Schema.Union([Schema.Literal("pending"), Schema.Literal("completed"), Schema.Literal("error")]);

/** Input for a command execution tool. */
export const CommandToolInput = Schema.Struct({
  command: Schema.String,
  timeoutMs: Schema.optional(Schema.Number),
});

/** Result data produced by a command execution tool. */
export const CommandToolResult = Schema.Struct({
  output: Schema.String,
  truncated: Schema.Boolean,
});

/** Input for reading a file or a section of a file. */
export const FileReadToolInput = Schema.Struct({
  path: Schema.String,
  offset: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number),
});

/** Result data produced by a file read tool. */
export const FileReadToolResult = Schema.Struct({
  content: Schema.optional(Schema.String),
  truncated: Schema.optional(Schema.Boolean),
});

/** Input for listing entries in a directory. */
export const FileListToolInput = Schema.Struct({
  path: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
});

/** Result data produced by a file listing tool. */
export const FileListToolResult = Schema.Struct({
  entries: Schema.optional(Schema.String),
  truncated: Schema.optional(Schema.Boolean),
});

/** Input for editing a file through exact text replacements. */
export const FileEditToolInput = Schema.Struct({
  path: Schema.String,
  replacements: Schema.Array(
    Schema.Struct({
      oldText: Schema.String,
      newText: Schema.String,
    })
  ),
});

/** Result data produced by a file edit tool. */
export const FileEditToolResult = Schema.Struct({
  diff: Schema.optional(Schema.String),
  firstChangedLine: Schema.optional(Schema.Number),
});

/** Input for finding files by path or name pattern. */
export const FileFindToolInput = Schema.Struct({
  pattern: Schema.String,
  path: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
});

/** Result data produced by a file finding tool. */
export const FileFindToolResult = Schema.Struct({
  matches: Schema.optional(Schema.String),
  truncated: Schema.optional(Schema.Boolean),
});

/** Input payload for a custom or unknown tool. */
export const CustomToolInput = Schema.Record(Schema.String, Schema.Unknown);

/** Result data produced by a custom or unknown tool. */
export const CustomToolResult = Schema.Struct({
  output: Schema.optional(Schema.String),
  data: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

const pendingToolFields = {status: Schema.Literal("pending")};
const errorToolFields = {error: Schema.String, status: Schema.Literal("error")};

function sessionToolStates<const Kind extends string, const Input extends Schema.Codec<unknown>, const Result extends Schema.Codec<unknown>>(
  kind: Kind,
  input: Input,
  result: Result
) {
  const kindField = {kind: Schema.Literal(kind)};

  return [
    Schema.Struct({...pendingToolFields, ...kindField, input: Schema.optional(input)}),
    Schema.Struct({...kindField, input: Schema.optional(input), result, status: Schema.Literal("completed")}),
    Schema.Struct({...errorToolFields, ...kindField, input: Schema.optional(input)}),
  ] as const;
}

/** Provider-agnostic tool metadata and result data for a session turn. */
export const SessionTool = Schema.Union([
  ...sessionToolStates("command", CommandToolInput, CommandToolResult),
  ...sessionToolStates("file-read", FileReadToolInput, FileReadToolResult),
  ...sessionToolStates("file-list", FileListToolInput, FileListToolResult),
  ...sessionToolStates("file-edit", FileEditToolInput, FileEditToolResult),
  ...sessionToolStates("file-find", FileFindToolInput, FileFindToolResult),
  ...sessionToolStates("custom", CustomToolInput, CustomToolResult),
]);

export type ToolStatus = typeof ToolStatus.Type;
export type CommandToolInput = typeof CommandToolInput.Type;
export type CommandToolResult = typeof CommandToolResult.Type;
export type FileReadToolInput = typeof FileReadToolInput.Type;
export type FileReadToolResult = typeof FileReadToolResult.Type;
export type FileListToolInput = typeof FileListToolInput.Type;
export type FileListToolResult = typeof FileListToolResult.Type;
export type FileEditToolInput = typeof FileEditToolInput.Type;
export type FileEditToolResult = typeof FileEditToolResult.Type;
export type FileFindToolInput = typeof FileFindToolInput.Type;
export type FileFindToolResult = typeof FileFindToolResult.Type;
export type CustomToolInput = typeof CustomToolInput.Type;
export type CustomToolResult = typeof CustomToolResult.Type;
export type SessionTool = typeof SessionTool.Type;
