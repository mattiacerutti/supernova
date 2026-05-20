import {useState} from "react";
import type {ReactNode} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import DiffViewer from "@/features/sessions/components/diffs/diff-viewer";
import TranscriptBlock from "@/features/sessions/components/messages/transcript-block";
import {parseFileEditPatch} from "@/features/sessions/lib/diff-rendering";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";
import type {SessionTool} from "@supernova/contracts/sessions/schemas";

export type ToolDetailMode = "collapsible" | "visible";

type ToolEvent = Extract<SessionWorkEvent, {type: "tool"}>;
type FileMutationTool = Extract<SessionTool, {kind: "file-edit" | "file-write"}>;

function fileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export interface FileEditDiffStats {
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

function CodeBlock(props: {children: ReactNode; className?: string}) {
  const {children, className} = props;

  return <TranscriptBlock className={cn("p-3 font-mono", className)}>{children}</TranscriptBlock>;
}

function DetailText(props: {children: ReactNode; className?: string}) {
  const {children, className} = props;
  return <p className={cn("min-w-0 wrap-break-word text-sm leading-none text-neutral-500", className)}>{children}</p>;
}

function DefaultToolDetails(props: {tool: SessionTool}) {
  const {tool} = props;

  return (
    <div className="space-y-2">
      {tool.input && <CodeBlock>{formatJson(tool.input)}</CodeBlock>}
      {tool.status === "error" && <DetailText className="text-red-300">{tool.error}</DetailText>}
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
    <CodeBlock className="p-0 text-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-neutral-800 px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-neutral-500">
        <span>Shell</span>
      </div>
      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
        <pre className="whitespace-pre-wrap wrap-break-word text-neutral-200">$ {tool.input.command}</pre>
        {hasOutput && <pre className={cn("whitespace-pre-wrap wrap-break-word", tool.status === "error" ? "text-red-300" : "text-neutral-400")}>{output}</pre>}
        {tool.status === "completed" && tool.result.truncated && <DetailText className="mt-2 font-sans">Output was truncated.</DetailText>}
      </div>
    </CodeBlock>
  );
}

function ReadToolDetails(props: {tool: Extract<SessionTool, {kind: "file-read"}>}) {
  const {tool} = props;

  if (tool.input === undefined) {
    return null;
  }

  const lineWindow = [
    tool.input?.offset !== undefined ? `from line ${tool.input.offset}` : undefined,
    tool.input?.limit !== undefined ? ` to ${tool.input.limit}` : undefined,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <DetailText>{lineWindow.length > 0 && <span>{lineWindow}</span>}</DetailText>
      {tool.status === "completed" && tool.result.truncated && <DetailText>Read output was truncated.</DetailText>}
      {tool.status === "error" && <DetailText className="text-red-300">{tool.error}</DetailText>}
    </div>
  );
}

function FileMutationToolDetails(props: {tool: FileMutationTool}) {
  const {tool} = props;

  if (tool.input === undefined || tool.status === "pending") {
    return null;
  }

  const path = tool.input?.path;
  const patch = tool.status === "completed" ? tool.result.patch : undefined;
  const fileDiff = patch ? parseFileEditPatch({patch, path}) : undefined;

  return (
    <TranscriptBlock className="overflow-auto p-0 text-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-neutral-800 px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-neutral-500">
        <span className="min-w-0 truncate">{fileName(path)}</span>
      </div>
      {fileDiff && <DiffViewer fileDiff={fileDiff} key={patch} />}
      {tool.status === "error" && <p className="px-2.5 pb-2.5 text-sm leading-none text-red-300">{tool.error}</p>}
    </TranscriptBlock>
  );
}

function ToolTitleRow(props: {children: ReactNode; icon: "folder" | "server"}) {
  const {children, icon} = props;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon name={icon} size="xs" />
      {children}
    </div>
  );
}

function DefaultToolTitle(props: {tool: SessionTool | undefined}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="folder">
      <span className="min-w-0 wrap-break-word">{tool?.status === "pending" ? "Running tool" : "Ran tool"}</span>
    </ToolTitleRow>
  );
}

function CommandToolTitle(props: {tool: Extract<SessionTool, {kind: "command"}>}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="server">
      <span className="min-w-0 wrap-break-word">{tool.status === "pending" ? "Running command" : "Ran command"}</span>
    </ToolTitleRow>
  );
}

function ReadToolTitle(props: {tool: Extract<SessionTool, {kind: "file-read"}>}) {
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

function ListToolTitle(props: {tool: Extract<SessionTool, {kind: "file-list"}>}) {
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

function FindToolTitle(props: {tool: Extract<SessionTool, {kind: "file-find"}>}) {
  const {tool} = props;

  return (
    <ToolTitleRow icon="folder">
      <span className="min-w-0 wrap-break-word">{tool.status === "pending" ? "Exploring files" : "Explored files"}</span>
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
    default:
      return <DefaultToolTitle tool={event.tool} />;
  }
}

function ToolTitle(props: {event: ToolEvent}) {
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

function ToolDetails(props: {tool: SessionTool | undefined}) {
  const {tool} = props;

  if (!tool) return <DetailText>Tool details are unavailable.</DetailText>;

  switch (tool.kind) {
    case "command":
      return <CommandToolDetails tool={tool} />;
    case "file-read":
      return <ReadToolDetails tool={tool} />;
    case "file-edit":
    case "file-write":
      return <FileMutationToolDetails tool={tool} />;
    // NOTE: Readonly tools such as list and find are supported but never exposed to the agent by Pi, so we don't have a custom UI yet.
    default:
      return <DefaultToolDetails tool={tool} />;
  }
}

export default function ToolEvent(props: {event: ToolEvent; mode: ToolDetailMode}) {
  const {event, mode} = props;
  const [expanded, setExpanded] = useState(false);
  const details = <ToolDetails tool={event.tool} />;
  const detailsAvailable = details !== null;
  const showDetails = detailsAvailable && (mode === "visible" || expanded);

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
  };

  return (
    <div className="min-w-0 text-sm">
      {mode === "collapsible" && detailsAvailable ? (
        <Button
          aria-expanded={showDetails}
          className="group flex w-full min-w-0 items-center gap-2 px-0 py-0 text-left text-neutral-600 hover:text-neutral-500"
          onClick={handleToggle}
          variant="ghost"
        >
          <ToolTitle event={event} />
          <Icon className={cn("transition-transform duration-160 ease-out", showDetails && "rotate-90")} name="chevron-right" size="xs" />
        </Button>
      ) : (
        <div className="flex min-w-0 items-start gap-2 text-neutral-600">
          <ToolTitle event={event} />
        </div>
      )}
      {detailsAvailable && (
        <div
          className={cn(
            "min-w-0 ",
            mode === "collapsible"
              ? "grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-240 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
              : "mt-2"
          )}
          data-expanded={showDetails}
        >
          <div className={cn("min-w-0 overflow-hidden", mode === "collapsible" && "pt-2")}>{details}</div>
        </div>
      )}
    </div>
  );
}
