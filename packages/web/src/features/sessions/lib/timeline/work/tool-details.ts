import type {IconName} from "@/components/ui/icon";
import type {SessionToolCall} from "@/features/sessions/types/session-turn";

/**
 * A Pi tool call read for rendering: the built-in tools by name with the arguments and result details Pi defines,
 * anything else (extension tools) as `custom`. Arguments are untyped JSON from the model, so each field is checked.
 */
export type ToolView =
  | {readonly kind: "command"; readonly command: string | undefined; readonly output: string | undefined; readonly truncated: boolean}
  | {readonly kind: "file-read"; readonly path: string | undefined; readonly offset: number | undefined; readonly limit: number | undefined; readonly truncated: boolean}
  | {readonly kind: "file-edit" | "file-write"; readonly path: string | undefined; readonly patch: string | undefined}
  | {readonly kind: "file-list"; readonly path: string | undefined}
  | {readonly kind: "file-find"; readonly path: string | undefined; readonly pattern: string | undefined}
  | {readonly kind: "web-fetch"; readonly url: string | undefined}
  | {readonly kind: "custom"; readonly name: string; readonly output: string | undefined; readonly details: unknown};

function stringField(value: unknown, key: string): string | undefined {
  const field = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  return typeof field === "string" ? field : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  const field = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
  return typeof field === "number" ? field : undefined;
}

function truncated(details: unknown): boolean {
  const truncation = typeof details === "object" && details !== null ? (details as {truncation?: {truncated?: unknown}}).truncation : undefined;
  return truncation?.truncated === true;
}

/** Text of a finished call's result, or what a running call streamed. */
export function toolOutputText(tool: SessionToolCall): string | undefined {
  if (!tool.result) return tool.output;
  return tool.result.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/** Converts full file content into a standard new-file unified patch. */
function newFilePatch(path: string | undefined, content: string | undefined): string {
  const lines = (content ?? "").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return [`--- /dev/null`, `+++ b/${path ?? "unknown file"}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join("\n");
}

export function toolView(tool: SessionToolCall): ToolView {
  const args = tool.arguments;
  const details = tool.result?.details;
  const done = tool.status === "completed";
  switch (tool.name) {
    case "bash":
      return {kind: "command", command: stringField(args, "command"), output: toolOutputText(tool), truncated: truncated(details)};
    case "read":
      return {kind: "file-read", path: stringField(args, "path"), offset: numberField(args, "offset"), limit: numberField(args, "limit"), truncated: truncated(details)};
    case "edit":
      return {kind: "file-edit", path: stringField(args, "path"), patch: done ? (stringField(details, "patch") ?? "") : undefined};
    case "write":
      return {kind: "file-write", path: stringField(args, "path"), patch: done ? newFilePatch(stringField(args, "path"), stringField(args, "content")) : undefined};
    case "ls":
      return {kind: "file-list", path: stringField(args, "path")};
    case "find":
    case "grep":
      return {kind: "file-find", path: stringField(args, "path"), pattern: stringField(args, "pattern")};
    case "web_fetch":
      return {kind: "web-fetch", url: stringField(args, "url") ?? stringField(details, "url")};
    default:
      return {kind: "custom", name: tool.name, output: toolOutputText(tool), details};
  }
}

function pathSegments(path: string): readonly string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

/** Returns the last segment of a file path, or the path itself when it has none. */
export function fileName(path: string): string {
  return pathSegments(path).at(-1) ?? path;
}

/** Returns the skill name for a SKILL.md read, or undefined when the path is a regular file. */
export function skillName(path: string): string | undefined {
  const segments = pathSegments(path);
  return segments.at(-1) === "SKILL.md" ? segments.at(-2) : undefined;
}

/** Compact line range a file read covered ("L120–169", "L120+", "L1–50"), or undefined for a whole-file read. */
export function readLineRange(input: {readonly limit?: number; readonly offset?: number}): string | undefined {
  const start = input.offset ?? 1;
  if (input.limit !== undefined) return `L${start}–${start + input.limit - 1}`;
  return input.offset === undefined ? undefined : `L${start}+`;
}

/** Whether a tool's details panel would show anything. Cheap, so callers can offer an expand control without rendering the (possibly heavy) details. */
export function hasToolDetails(tool: SessionToolCall): boolean {
  const view = toolView(tool);
  switch (view.kind) {
    case "command":
      return view.command !== undefined;
    case "file-read":
      // The range already shows on the row; only a failure or a truncated result adds anything.
      if (view.path === undefined || skillName(view.path) !== undefined) return false;
      return tool.status === "error" || (tool.status === "completed" && view.truncated);
    case "file-edit":
    case "file-write":
      return view.path !== undefined && tool.status !== "pending";
    case "web-fetch":
      return Boolean(view.url);
    default:
      return true;
  }
}

/** The rail glyph for a tool; the row draws it on the tree branch rather than inline. */
export function toolIcon(tool: SessionToolCall): IconName {
  const view = toolView(tool);
  switch (view.kind) {
    case "command":
      return "tool-command";
    case "file-read":
      return skillName(view.path ?? "") === undefined ? "tool-read" : "skill";
    case "file-edit":
      return "tool-edit";
    case "file-write":
      return "tool-write";
    case "file-list":
    case "file-find":
      return "tool-find";
    case "web-fetch":
      return "tool-fetch";
    default:
      return "tool-unknown";
  }
}
