import type {Tool} from "@supernova/contracts/sessions/schemas";
import type {IconName} from "@/components/ui/icon";
import {fileName, skillName} from "@/features/sessions/lib/timeline/tool-details";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One-line summary of a work group: "Ran 3 commands · edited 2 files · 1 failed". */
export function summarizeWork(events: readonly SessionWorkEvent[]): string {
  let commands = 0;
  let reads = 0;
  let searches = 0;
  let fetches = 0;
  let other = 0;
  let failed = 0;
  const edited = new Set<string>();

  for (const event of events) {
    const tool = event.tool;
    if (tool?.status === "error") failed += 1;

    switch (tool?.kind) {
      case "command":
        commands += 1;
        break;
      case "file-edit":
      case "file-write":
        edited.add(tool.input?.path ?? `unknown:${event.id}`);
        break;
      case "file-read":
        reads += 1;
        break;
      case "file-find":
      case "file-list":
        searches += 1;
        break;
      case "web-fetch":
        fetches += 1;
        break;
      default:
        other += 1;
    }
  }

  const segments: string[] = [];
  if (commands > 0) segments.push(`ran ${plural(commands, "command", "commands")}`);
  if (edited.size > 0) segments.push(`edited ${plural(edited.size, "file", "files")}`);
  if (reads > 0) segments.push(`read ${plural(reads, "file", "files")}`);
  if (searches > 0) segments.push(`searched ${plural(searches, "time", "times")}`);
  if (fetches > 0) segments.push(`fetched ${plural(fetches, "page", "pages")}`);
  if (other > 0) segments.push(`called ${plural(other, "tool", "tools")}`);
  if (segments.length === 0) segments.push(plural(events.length, "tool", "tools"));
  if (failed > 0) segments.push(`${failed} failed`);

  return capitalize(segments.join(" · "));
}

export interface ToolChipContent {
  readonly detail: string;
  /** Set when the detail names a file, so it can render as a file badge. */
  readonly filePath: string | undefined;
  readonly icon: IconName;
  readonly label: string;
}

function singleLine(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

/** Short label, detail line, and icon for a tool chip. */
export function describeTool(tool: Tool | undefined): ToolChipContent {
  switch (tool?.kind) {
    case "command":
      return {detail: singleLine(tool.input?.command ?? ""), filePath: undefined, icon: "tool-command", label: "Run"};
    case "file-read": {
      const path = tool.input?.path;
      const skill = path ? skillName(path) : undefined;
      if (skill !== undefined) return {detail: skill, filePath: undefined, icon: "skill", label: "Skill"};
      return {detail: path ? fileName(path) : "", filePath: path, icon: "tool-read", label: "Read"};
    }
    case "file-write":
      return {detail: tool.input?.path ? fileName(tool.input.path) : "", filePath: tool.input?.path, icon: "tool-write", label: "Write"};
    case "file-edit":
      return {detail: tool.input?.path ? fileName(tool.input.path) : "", filePath: tool.input?.path, icon: "tool-edit", label: "Edit"};
    case "file-list":
      return {detail: tool.input?.path ?? "", filePath: undefined, icon: "tool-find", label: "List"};
    case "file-find":
      return {
        detail: singleLine(tool.input ? (tool.input.path ? `${tool.input.pattern} in ${tool.input.path}` : tool.input.pattern) : ""),
        filePath: undefined,
        icon: "tool-find",
        label: "Glob",
      };
    case "web-fetch":
      return {detail: tool.input?.url ?? (tool.status === "completed" ? tool.result.url : ""), filePath: undefined, icon: "tool-fetch", label: "Fetch"};
    case "custom":
      return {detail: tool.name, filePath: undefined, icon: "tool-unknown", label: "Tool"};
    default:
      return {detail: "", filePath: undefined, icon: "tool-unknown", label: "Tool"};
  }
}
