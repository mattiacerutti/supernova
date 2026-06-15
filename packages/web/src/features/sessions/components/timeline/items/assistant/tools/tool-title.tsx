import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import type {Tool} from "@supernova/contracts/sessions/schemas";

type ToolEvent = Extract<SessionWorkEvent, {type: "tool"}>;
type FileMutationTool = Extract<Tool, {kind: "file-edit" | "file-write"}>;

function fileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

interface FileEditDiffStats {
  readonly additions: number;
  readonly deletions: number;
}

function getFileEditDiffStats(patch: string): FileEditDiffStats {
  return patch.split("\n").reduce(
    (stats, line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return stats;
      if (line.startsWith("+")) return {...stats, additions: stats.additions + 1};
      if (line.startsWith("-")) return {...stats, deletions: stats.deletions + 1};
      return stats;
    },
    {additions: 0, deletions: 0}
  );
}

function ToolTitleRow(props: {children: ReactNode; icon: "folder" | "globe" | "server"}) {
  const {children, icon} = props;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon name={icon} size="xs" />
      {children}
    </div>
  );
}

function DefaultToolTitle(props: {tool: Tool | undefined}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="folder">
      <span className="min-w-0 wrap-break-word">{tool?.status === "pending" ? "Running tool" : "Ran tool"}</span>
    </ToolTitleRow>
  );
}

function CommandToolTitle(props: {tool: Extract<Tool, {kind: "command"}>}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="server">
      <span className="min-w-0 wrap-break-word">{tool.status === "pending" ? "Running command" : "Ran command"}</span>
    </ToolTitleRow>
  );
}

function ReadToolTitle(props: {tool: Extract<Tool, {kind: "file-read"}>}) {
  const {tool} = props;

  const name = tool.input?.path ? ` ${fileName(tool.input.path)}` : "a file";

  return (
    <ToolTitleRow icon="folder">
      <span className="min-w-0 wrap-break-word">
        {tool.status === "pending" ? "Reading" : "Read"} {name}
      </span>
    </ToolTitleRow>
  );
}

function ListToolTitle(props: {tool: Extract<Tool, {kind: "file-list"}>}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="folder">
      <span className="min-w-0 wrap-break-word">{tool.status === "pending" ? "Listing files" : "Listed files"}</span>
    </ToolTitleRow>
  );
}

function FileMutationToolTitle(props: {tool: FileMutationTool}) {
  const {tool} = props;

  const verb = tool.kind === "file-edit" ? (tool.status === "pending" ? "Editing" : "Edited") : tool.status === "pending" ? "Writing" : "Wrote";
  const name = tool.input?.path ? ` ${fileName(tool.input.path)}` : " a file";

  const stats = tool?.status === "completed" ? getFileEditDiffStats(tool.result.patch) : undefined;

  return (
    <ToolTitleRow icon="folder">
      <span className="min-w-0 wrap-break-word">
        {verb} {name}
      </span>

      {stats && (
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs leading-none">
          <span className="text-emerald-400">+{stats.additions}</span>
          <span className="text-red-400">-{stats.deletions}</span>
        </span>
      )}
    </ToolTitleRow>
  );
}

function FindToolTitle(props: {tool: Extract<Tool, {kind: "file-find"}>}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="folder">
      <span className="min-w-0 wrap-break-word">{tool.status === "pending" ? "Exploring files" : "Explored files"}</span>
    </ToolTitleRow>
  );
}

function WebFetchToolTitle(props: {tool: Extract<Tool, {kind: "web-fetch"}>}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="globe">
      <span className="min-w-0 wrap-break-word">{tool.status === "pending" ? "Fetching an URL" : "Fetched an URL"}</span>
    </ToolTitleRow>
  );
}

function ToolTitleContent(props: {event: ToolEvent}) {
  const {event} = props;

  switch (event.tool?.kind) {
    case "command":
      return <CommandToolTitle tool={event.tool} />;
    case "file-read":
      return <ReadToolTitle tool={event.tool} />;
    case "file-list":
      return <ListToolTitle tool={event.tool} />;
    case "file-edit":
    case "file-write":
      return <FileMutationToolTitle tool={event.tool} />;
    case "file-find":
      return <FindToolTitle tool={event.tool} />;
    case "web-fetch":
      return <WebFetchToolTitle tool={event.tool} />;
    default:
      return <DefaultToolTitle tool={event.tool} />;
  }
}

export default function ToolTitle(props: {event: ToolEvent}) {
  const {event} = props;
  const pending = event.tool?.status === "pending";
  const content = <ToolTitleContent event={event} />;

  return (
    <div className="relative grid min-w-0">
      <div className="col-start-1 row-start-1 min-w-0">{content}</div>
      {pending && (
        <div aria-hidden="true" className="thinking-shimmer col-start-1 row-start-1 min-w-0 text-neutral-200">
          {content}
        </div>
      )}
    </div>
  );
}
