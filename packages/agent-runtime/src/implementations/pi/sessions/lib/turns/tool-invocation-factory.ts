import type {
  BashToolDetails,
  BashToolInput,
  EditToolDetails,
  EditToolInput,
  FindToolDetails,
  FindToolInput,
  LsToolDetails,
  LsToolInput,
  ReadToolDetails,
  ReadToolInput,
  WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import type {ImageContent, TextContent} from "@earendil-works/pi-ai";
import {
  CommandToolInput,
  type CommandToolResult,
  type CustomToolInput,
  type CustomToolResult,
  FileEditToolInput as FileEditToolInputSchema,
  type FileEditToolInput,
  type FileEditToolResult,
  FileFindToolInput as FileFindToolInputSchema,
  type FileFindToolInput,
  type FileFindToolResult,
  FileListToolInput as FileListToolInputSchema,
  type FileListToolInput,
  type FileListToolResult,
  FileReadToolInput as FileReadToolInputSchema,
  type FileReadToolInput,
  type FileReadToolResult,
  FileWriteToolInput as FileWriteToolInputSchema,
  type FileWriteToolInput,
  type FileWriteToolResult,
  type SessionTool,
  type ToolStatus,
} from "@supernova/contracts/sessions/schemas";
import {fileContentToNewFilePatch, piEditDiffToPatch} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/edit-patch";
import {piContentToText} from "./message-content";
import {Option, Schema} from "effect";

type PiToolOutput = string | readonly (TextContent | ImageContent)[];

export interface PiToolCompletion<TDetails> {
  readonly output: PiToolOutput;
  readonly details: TDetails | undefined;
  readonly isError: boolean;
}

export abstract class PiToolInvocation<TPiInput = unknown, TPiDetails = unknown, TInput = unknown, TResult = unknown> {
  public readonly name: string;
  protected readonly kind: SessionTool["kind"];

  protected status: ToolStatus = "pending";
  protected error: string | undefined;

  protected readonly input: TInput | undefined;
  protected result: TResult | undefined;

  protected constructor(name: string, kind: SessionTool["kind"], input: Partial<TPiInput> | undefined) {
    this.kind = kind;
    this.name = name;

    if (input !== undefined) {
      const createdInput = this.createInput(input);
      if (createdInput !== undefined) {
        this.input = createdInput;
      }
    }
  }

  public complete(completion: PiToolCompletion<TPiDetails>): void {
    this.status = completion.isError ? "error" : "completed";
    if (completion.isError) {
      this.error = piContentToText(completion.output);
      return;
    }

    this.result = this.createResult(completion);
  }

  public toSessionTool(): SessionTool {
    const base = {input: this.input, kind: this.kind} as const;
    if (this.status === "error") return {...base, error: this.errorMessage(), status: "error"} as SessionTool;
    if (this.status === "completed") return {...base, result: this.completedResult(), status: "completed"} as SessionTool;
    return {...base, status: "pending"} as SessionTool;
  }

  protected abstract createResult(completion: PiToolCompletion<TPiDetails>): TResult;
  protected abstract createInput(input: Partial<TPiInput>): TInput | undefined;

  private completedResult(): TResult {
    if (this.result === undefined) throw new Error(`Completed ${this.name} tool is missing result.`);
    return this.result;
  }

  private errorMessage(): string {
    return this.error ?? "Tool failed.";
  }
}

class BashPiToolInvocation extends PiToolInvocation<BashToolInput, BashToolDetails, CommandToolInput, CommandToolResult> {
  public constructor(input: Partial<BashToolInput> | undefined) {
    super("bash", "command", input);
  }

  protected override createInput(input: Partial<BashToolInput>): CommandToolInput | undefined {
    const candidate = {command: input.command, timeoutMs: input.timeout} satisfies Partial<CommandToolInput>;
    return Schema.decodeUnknownOption(CommandToolInput)(candidate).pipe(Option.getOrUndefined);
  }

  protected createResult(completion: PiToolCompletion<BashToolDetails>): CommandToolResult {
    const output = piContentToText(completion.output);
    return {output, truncated: completion.details?.truncation?.truncated ?? false};
  }
}

class ReadPiToolInvocation extends PiToolInvocation<ReadToolInput, ReadToolDetails, FileReadToolInput, FileReadToolResult> {
  public constructor(input: Partial<ReadToolInput> | undefined) {
    super("read", "file-read", input);
  }

  protected createInput(input: Partial<ReadToolInput>): FileReadToolInput | undefined {
    const candidate = {limit: input.limit, offset: input.offset, path: input.path} satisfies Partial<FileReadToolInput>;
    return Schema.decodeUnknownOption(FileReadToolInputSchema)(candidate).pipe(Option.getOrUndefined);
  }

  protected createResult(completion: PiToolCompletion<ReadToolDetails>): FileReadToolResult {
    const output = piContentToText(completion.output);
    return {content: output, truncated: completion.details?.truncation?.truncated};
  }
}

class ListPiToolInvocation extends PiToolInvocation<LsToolInput, LsToolDetails, FileListToolInput, FileListToolResult> {
  public constructor(input: Partial<LsToolInput> | undefined) {
    super("ls", "file-list", input);
  }

  protected createInput(input: Partial<LsToolInput>): FileListToolInput | undefined {
    const candidate = {limit: input.limit, path: input.path} satisfies Partial<FileListToolInput>;
    return Schema.decodeUnknownOption(FileListToolInputSchema)(candidate).pipe(Option.getOrUndefined);
  }

  protected createResult(completion: PiToolCompletion<LsToolDetails>): FileListToolResult {
    const output = piContentToText(completion.output);
    return {entries: output, truncated: completion.details?.truncation?.truncated};
  }
}

class EditPiToolInvocation extends PiToolInvocation<EditToolInput, EditToolDetails, FileEditToolInput, FileEditToolResult> {
  public constructor(input: Partial<EditToolInput> | undefined) {
    super("edit", "file-edit", input);
  }

  protected createInput(input: Partial<EditToolInput>): FileEditToolInput | undefined {
    const candidate = {path: input.path, replacements: input.edits} satisfies Partial<FileEditToolInput>;
    return Schema.decodeUnknownOption(FileEditToolInputSchema)(candidate).pipe(Option.getOrUndefined);
  }

  protected createResult(completion: PiToolCompletion<EditToolDetails>): FileEditToolResult {
    return {patch: piEditDiffToPatch({diff: completion.details?.diff, firstChangedLine: completion.details?.firstChangedLine, path: this.input?.path})};
  }
}

class WritePiToolInvocation extends PiToolInvocation<WriteToolInput, undefined, FileWriteToolInput, FileWriteToolResult> {
  public constructor(input: Partial<WriteToolInput> | undefined) {
    super("write", "file-write", input);
  }

  protected createInput(input: Partial<WriteToolInput>): FileWriteToolInput | undefined {
    const candidate = {content: input.content, path: input.path} satisfies Partial<FileWriteToolInput>;
    return Schema.decodeUnknownOption(FileWriteToolInputSchema)(candidate).pipe(Option.getOrUndefined);
  }

  protected createResult(): FileWriteToolResult {
    return {patch: fileContentToNewFilePatch({content: this.input?.content, path: this.input?.path})};
  }
}

class FindPiToolInvocation extends PiToolInvocation<FindToolInput, FindToolDetails, FileFindToolInput, FileFindToolResult> {
  public constructor(input: Partial<FindToolInput> | undefined) {
    super("find", "file-find", input);
  }

  protected createInput(input: Partial<FindToolInput>): FileFindToolInput | undefined {
    const candidate = {limit: input.limit, path: input.path, pattern: input.pattern} satisfies Partial<FileFindToolInput>;
    return Schema.decodeUnknownOption(FileFindToolInputSchema)(candidate).pipe(Option.getOrUndefined);
  }

  protected createResult(completion: PiToolCompletion<FindToolDetails>): FileFindToolResult {
    const output = piContentToText(completion.output);
    return {matches: output, truncated: completion.details?.truncation?.truncated};
  }
}

class CustomPiToolInvocation extends PiToolInvocation<CustomToolInput, Record<string, unknown>, CustomToolInput, CustomToolResult> {
  public constructor(name: string, input: Record<string, unknown> | undefined) {
    super(name, "custom", input);
  }

  protected createInput(input: Record<string, unknown>): CustomToolInput {
    return input;
  }

  protected createResult(completion: PiToolCompletion<Record<string, unknown>>): CustomToolResult {
    const output = piContentToText(completion.output);
    return {data: completion.details, output};
  }
}

export class PiToolInvocationFactory {
  public static create(toolName: string, input: Record<string, unknown> | undefined): PiToolInvocation {
    switch (toolName) {
      case "bash":
        return new BashPiToolInvocation(input);
      case "read":
        return new ReadPiToolInvocation(input);
      case "ls":
        return new ListPiToolInvocation(input);
      case "edit":
        return new EditPiToolInvocation(input);
      case "write":
        return new WritePiToolInvocation(input);
      case "find":
        return new FindPiToolInvocation(input);
      default:
        return new CustomPiToolInvocation(toolName, input);
    }
  }
}
