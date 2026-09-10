import type {Tool} from "@supernova/contracts/sessions/schemas";

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

/** Describes the line range a file read covered, or undefined when it read the whole file. */
export function readLineWindow(input: {readonly limit?: number; readonly offset?: number}): string | undefined {
  if (input.offset !== undefined) {
    return input.limit === undefined ? `Read from line ${input.offset}` : `Read from line ${input.offset} to ${input.offset + input.limit}`;
  }
  return input.limit === undefined ? undefined : `Read the first ${input.limit} lines`;
}

/** Whether a tool's details panel would show anything. Cheap, so callers can offer an expand control without rendering the (possibly heavy) details. */
export function hasToolDetails(tool: Tool | undefined): boolean {
  if (!tool) return true;

  switch (tool.kind) {
    case "command":
      return tool.input !== undefined;
    case "file-read":
      if (tool.input === undefined || skillName(tool.input.path) !== undefined) return false;
      return !(tool.status === "completed" && readLineWindow(tool.input) === undefined && !tool.result.truncated);
    case "file-edit":
    case "file-write":
      return tool.input !== undefined && tool.status !== "pending";
    case "web-fetch":
      return Boolean(tool.input?.url ?? (tool.status === "completed" ? tool.result.url : undefined));
    default:
      return true;
  }
}
