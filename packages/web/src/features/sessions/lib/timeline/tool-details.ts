import type {Tool} from "@supernova/contracts/sessions/schemas";
import type {IconName} from "@/components/ui/icon";

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
export function hasToolDetails(tool: Tool | undefined): boolean {
  if (!tool) return true;

  switch (tool.kind) {
    case "command":
      return tool.input !== undefined;
    case "file-read":
      // The range already shows on the row; only a failure or a truncated result adds anything.
      if (tool.input === undefined || skillName(tool.input.path) !== undefined) return false;
      return tool.status === "error" || (tool.status === "completed" && tool.result.truncated === true);
    case "file-edit":
    case "file-write":
      return tool.input !== undefined && tool.status !== "pending";
    case "web-fetch":
      return Boolean(tool.input?.url ?? (tool.status === "completed" ? tool.result.url : undefined));
    default:
      return true;
  }
}

/** The rail glyph for a tool; the row draws it on the tree branch rather than inline. */
export function toolIcon(tool: Tool | undefined): IconName {
  switch (tool?.kind) {
    case "command":
      return "tool-command";
    case "file-read":
      return skillName(tool.input?.path ?? "") === undefined ? "tool-read" : "skill";
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
