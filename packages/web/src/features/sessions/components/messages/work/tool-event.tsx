import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {getWorkIconName, getWorkSummary} from "@/features/sessions/lib/session-timeline/work-timeline-items";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

export type ToolDetailMode = "collapsible" | "visible";

type ToolEvent = Extract<SessionWorkEvent, {type: "tool"}>;
type SessionTool = NonNullable<ToolEvent["tool"]>;

const codeBlockClassName = "max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word rounded-xl border border-white/8 bg-black/30 p-3 font-mono text-xs leading-relaxed";
const detailTextClassName = "min-w-0 wrap-break-word text-sm text-neutral-500";

function fileName(path: string | undefined): string {
  if (!path) return "unknown file";
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function renderOutput(output: string | undefined, fallback: string, truncated?: boolean) {
  const content = output && output.length > 0 ? output : fallback;

  return (
    <div className="space-y-1.5">
      <pre className={cn(codeBlockClassName, output && output.length > 0 ? "text-neutral-300" : "text-neutral-500")}>{content}</pre>
      {truncated && <p className={detailTextClassName}>Output was truncated.</p>}
    </div>
  );
}

//TODO: Review UI
function DefaultToolDetails(props: {tool: Extract<SessionTool, {kind: "custom" | "file-edit"}>}) {
  const {tool} = props;

  if (tool.kind === "file-edit") {
    const path = tool.input?.path;
    const replacementCount = tool.input?.replacements.length ?? 0;
    return (
      <div className="space-y-2">
        <p className={detailTextClassName}>
          edited <span className="font-mono text-neutral-400">{fileName(path)}</span> with {replacementCount} {replacementCount === 1 ? "replacement" : "replacements"}
        </p>
        {path && <p className={detailTextClassName}>{path}</p>}
        {tool.status === "completed" && renderOutput(tool.result.diff, "Edit completed.")}
        {tool.status === "error" && <pre className={cn(codeBlockClassName, "text-neutral-500")}>{tool.error}</pre>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tool.input && <pre className={cn(codeBlockClassName, "text-neutral-300")}>{formatJson(tool.input)}</pre>}
      {tool.status === "completed" && renderOutput(tool.result.output, tool.result.data ? formatJson(tool.result.data) : "Tool completed.")}
      {tool.status === "error" && <pre className={cn(codeBlockClassName, "text-neutral-500")}>{tool.error}</pre>}
    </div>
  );
}

function CommandToolDetails(props: {tool: Extract<SessionTool, {kind: "command"}>}) {
  const {tool} = props;

  if (tool.input === undefined) {
    return null;
  }

  const output = tool.status === "completed" ? tool.result.output : tool.status === "error" ? tool.error : undefined;
  const hasOutput = output !== undefined && output.length > 0;

  return (
    <div className="rounded-xl border border-white/8 bg-white/6 p-2.5 font-mono text-sm leading-relaxed text-neutral-300 flex flex-col gap-1.5">
      <div className="mb-1.5 font-sans text-sm text-neutral-500 flex justify-between items-center">
        <span>Shell</span>
      </div>
      <pre className="whitespace-pre-wrap wrap-break-word text-neutral-200">$ {tool.input.command}</pre>
      {hasOutput && <pre className={cn("whitespace-pre-wrap wrap-break-word", tool.status === "error" ? "text-red-300" : "text-neutral-400")}>{output}</pre>}
      {tool.status === "completed" && tool.result.truncated && <p className={cn(detailTextClassName, "mt-2 font-sans")}>Output was truncated.</p>}
    </div>
  );
}

function ReadToolDetails(props: {tool: Extract<SessionTool, {kind: "file-read"}>}) {
  const {tool} = props;
  const path = tool.input?.path;

  const lineWindow = [
    tool.input?.offset !== undefined ? `from line ${tool.input.offset}` : undefined,
    tool.input?.limit !== undefined ? ` to ${tool.input.limit}` : undefined,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <p className={detailTextClassName}>
        Read {fileName(path)}
        {lineWindow.length > 0 && <span> ({lineWindow})</span>}
      </p>
      {tool.status === "completed" && tool.result.truncated && <p className={detailTextClassName}>Read output was truncated.</p>}
      {tool.status === "error" && <pre className={cn(codeBlockClassName, "text-neutral-500")}>{tool.error}</pre>}
    </div>
  );
}

//TODO: Review UI
function ListToolDetails(props: {tool: Extract<SessionTool, {kind: "file-list"}>}) {
  const {tool} = props;
  const path = tool.input?.path ?? ".";

  return (
    <div className="space-y-2">
      <p className={detailTextClassName}>
        listed <span className="font-mono text-neutral-400">{path}</span>
      </p>
      {tool.status === "completed" && renderOutput(tool.result.entries, "No entries returned.", tool.result.truncated)}
      {tool.status === "error" && <pre className={cn(codeBlockClassName, "text-neutral-500")}>{tool.error}</pre>}
    </div>
  );
}

//TODO: Review UI
function FindToolDetails(props: {tool: Extract<SessionTool, {kind: "file-find"}>}) {
  const {tool} = props;
  const path = tool.input?.path ?? ".";
  const pattern = tool.input?.pattern ?? "unknown pattern";

  return (
    <div className="space-y-2">
      <p className={detailTextClassName}>
        searched <span className="font-mono text-neutral-400">{path}</span> for <span className="font-mono text-neutral-400">{pattern}</span>
      </p>
      {tool.status === "completed" && renderOutput(tool.result.matches, "No matches returned.", tool.result.truncated)}
      {tool.status === "error" && <pre className={cn(codeBlockClassName, "text-neutral-500")}>{tool.error}</pre>}
    </div>
  );
}

function ToolDetails(props: {tool: SessionTool | undefined}) {
  const {tool} = props;

  if (!tool) return <p className={detailTextClassName}>Tool details are unavailable.</p>;

  switch (tool.kind) {
    case "command":
      return <CommandToolDetails tool={tool} />;
    case "file-read":
      return <ReadToolDetails tool={tool} />;
    case "file-list":
      return <ListToolDetails tool={tool} />;
    case "file-find":
      return <FindToolDetails tool={tool} />;
    //TODO: Need diff UI for file-edit tools
    default:
      return <DefaultToolDetails tool={tool} />;
  }
}

export default function ToolEvent(props: {event: ToolEvent; mode: ToolDetailMode}) {
  const {event, mode} = props;
  const [expanded, setExpanded] = useState(false);
  const showDetails = mode === "visible" || expanded;

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
  };

  const titleText = getWorkSummary(event);
  const title = (
    <div className="flex items-center gap-2">
      <Icon className="" name={getWorkIconName(event)} size="xs" />
      <span className="relative min-w-0 wrap-break-word ">
        <span>{titleText}</span>
        {event.tool?.status === "pending" && (
          <span aria-hidden="true" className="thinking-shimmer absolute inset-0 text-neutral-200">
            {titleText}
          </span>
        )}
      </span>
    </div>
  );

  return (
    <div className="min-w-0 space-y-2 text-sm">
      {mode === "collapsible" ? (
        <Button
          aria-expanded={showDetails}
          className="group flex w-full min-w-0 items-center gap-2 px-0 py-0 text-left text-neutral-600 hover:text-neutral-500"
          onClick={handleToggle}
          variant="ghost"
        >
          {title}
          <Icon className={cn("mt-0.5 transition-transform duration-160 ease-out", showDetails && "rotate-90")} name="chevron-right" size="xs" />
        </Button>
      ) : (
        <div className="flex min-w-0 items-start gap-2 text-neutral-600">{title}</div>
      )}
      <div
        className={cn(
          "min-w-0 pt-1",
          mode === "collapsible" &&
            "grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-240 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
        )}
        data-expanded={showDetails}
      >
        <div className="min-w-0 overflow-hidden">
          <ToolDetails tool={event.tool} />
        </div>
      </div>
    </div>
  );
}
