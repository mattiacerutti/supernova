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
  patch: Schema.String,
});

/** Input for writing a full file. */
export const FileWriteToolInput = Schema.Struct({
  content: Schema.String,
  path: Schema.String,
});

/** Result data produced by a file write tool. */
export const FileWriteToolResult = Schema.Struct({
  patch: Schema.String,
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

/** Input for fetching content from the web. */
export const WebFetchToolInput = Schema.Struct({
  url: Schema.String,
  format: Schema.optional(Schema.Literals(["markdown", "text", "html"])),
  timeout: Schema.optional(Schema.Number),
});

/** Result data produced by a web fetch tool. */
export const WebFetchToolResult = Schema.Struct({
  url: Schema.String,
  contentType: Schema.String,
  format: Schema.Literals(["markdown", "text", "html"]),
  output: Schema.String,
});

/** Input payload for a custom or unknown tool. */
export const CustomToolInput = Schema.Record(Schema.String, Schema.Unknown);

/** Result data produced by a custom or unknown tool. */
export const CustomToolResult = Schema.Struct({
  output: Schema.optional(Schema.String),
  data: Schema.optional(Schema.Unknown),
});

const pendingToolFields = {status: Schema.Literal("pending")};
const errorToolFields = {error: Schema.String, status: Schema.Literal("error")};

function sessionToolStates<const Fields extends Schema.Struct.Fields, const Input extends Schema.Codec<unknown>, const Result extends Schema.Codec<unknown>>(
  fields: Fields,
  input: Input,
  result: Result
) {
  return [
    Schema.Struct({...pendingToolFields, ...fields, input: Schema.optional(input)}),
    Schema.Struct({...fields, input: Schema.optional(input), result, status: Schema.Literal("completed")}),
    Schema.Struct({...errorToolFields, ...fields, input: Schema.optional(input)}),
  ] as const;
}

/** Provider-agnostic tool metadata and result data for a session turn. */
export const Tool = Schema.Union([
  ...sessionToolStates({kind: Schema.Literal("command")}, CommandToolInput, CommandToolResult),
  ...sessionToolStates({kind: Schema.Literal("file-read")}, FileReadToolInput, FileReadToolResult),
  ...sessionToolStates({kind: Schema.Literal("file-list")}, FileListToolInput, FileListToolResult),
  ...sessionToolStates({kind: Schema.Literal("file-edit")}, FileEditToolInput, FileEditToolResult),
  ...sessionToolStates({kind: Schema.Literal("file-write")}, FileWriteToolInput, FileWriteToolResult),
  ...sessionToolStates({kind: Schema.Literal("file-find")}, FileFindToolInput, FileFindToolResult),
  ...sessionToolStates({kind: Schema.Literal("web-fetch")}, WebFetchToolInput, WebFetchToolResult),
  ...sessionToolStates({kind: Schema.Literal("custom"), name: Schema.String}, CustomToolInput, CustomToolResult),
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
export type FileWriteToolInput = typeof FileWriteToolInput.Type;
export type FileWriteToolResult = typeof FileWriteToolResult.Type;
export type FileFindToolInput = typeof FileFindToolInput.Type;
export type FileFindToolResult = typeof FileFindToolResult.Type;
export type WebFetchToolInput = typeof WebFetchToolInput.Type;
export type WebFetchToolResult = typeof WebFetchToolResult.Type;
export type CustomToolInput = typeof CustomToolInput.Type;
export type CustomToolResult = typeof CustomToolResult.Type;
export type Tool = typeof Tool.Type;
