import type {ReactNode} from "react";
import DiffViewer from "@/features/sessions/components/diffs/diff-viewer";
import ContentPanel from "@/features/sessions/components/timeline/items/assistant/content-panel";
import {parseFileEditPatch} from "@/features/sessions/lib/diff/diff-rendering";
import {cn} from "@/lib/cn";
import type {Tool} from "@supernova/contracts/sessions/schemas";

type FileMutationTool = Extract<Tool, {kind: "file-edit" | "file-write"}>;

function pathSegments(path: string): readonly string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

function fileName(path: string): string {
  return pathSegments(path).at(-1) ?? path;
}

function isSkillRead(path: string): boolean {
  return pathSegments(path).at(-1) === "SKILL.md";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function DetailText(props: {children: ReactNode; className?: string}) {
  const {children, className} = props;
  return <p className={cn("min-w-0 wrap-break-word text-sm leading-none text-neutral-500", className)}>{children}</p>;
}

function DefaultToolDetails(props: {tool: Tool}) {
  const {tool} = props;

  return (
    <div className="space-y-2">
      {tool.input && <ContentPanel className="font-mono">{formatJson(tool.input)}</ContentPanel>}
      {tool.status === "error" && <DetailText className="text-red-300">{tool.error}</DetailText>}
    </div>
  );
}

function CommandToolDetails(props: {tool: Extract<Tool, {kind: "command"}>}) {
  const {tool} = props;

  if (tool.input === undefined) {
    return null;
  }

  const output = tool.status === "completed" ? tool.result.output : tool.status === "error" ? tool.error : undefined;
  const hasOutput = output !== undefined && output.length > 0;

  return (
    <ContentPanel className="p-0 text-sm font-mono">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-neutral-800 px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-neutral-500">
        <span>Shell</span>
      </div>
      <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
        <pre className="whitespace-pre-wrap wrap-break-word text-neutral-200">$ {tool.input.command}</pre>
        {hasOutput && <pre className={cn("whitespace-pre-wrap wrap-break-word", tool.status === "error" ? "text-red-300" : "text-neutral-400")}>{output}</pre>}
        {tool.status === "completed" && tool.result.truncated && <DetailText className="mt-2 font-sans">Output was truncated.</DetailText>}
      </div>
    </ContentPanel>
  );
}

function ReadToolDetails(props: {tool: Extract<Tool, {kind: "file-read"}>}) {
  const {tool} = props;

  if (tool.input === undefined || isSkillRead(tool.input.path)) {
    return null;
  }

  let lineWindow: string | undefined;
  if (tool.input.offset !== undefined) {
    lineWindow = `Read from line ${tool.input.offset}`;
    if (tool.input.limit !== undefined) lineWindow += ` to ${tool.input.offset + tool.input.limit}`;
  } else if (tool.input.limit !== undefined) {
    lineWindow = `Read the first ${tool.input.limit} lines`;
  }

  if (tool.status === "completed" && lineWindow === undefined && !tool.result.truncated) {
    return null;
  }

  return (
    <div className="space-y-2">
      <DetailText>{lineWindow}</DetailText>
      {tool.status === "completed" && tool.result.truncated && <DetailText>Read output was truncated.</DetailText>}
      {tool.status === "error" && <DetailText className="text-red-300">{tool.error}</DetailText>}
    </div>
  );
}

function WebFetchToolDetails(props: {tool: Extract<Tool, {kind: "web-fetch"}>}) {
  const {tool} = props;

  const url = tool.input?.url ?? (tool.status === "completed" ? tool.result.url : undefined);

  if (!url) {
    return null;
  }

  return <DetailText>{url}</DetailText>;
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
    <ContentPanel className="overflow-auto p-0 text-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-neutral-800 px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-neutral-500">
        <span className="min-w-0 truncate">{fileName(path)}</span>
      </div>
      {fileDiff && <DiffViewer fileDiff={fileDiff} key={patch} />}
      {tool.status === "error" && <p className="px-2.5 pb-2.5 text-sm leading-none text-red-300">{tool.error}</p>}
    </ContentPanel>
  );
}

export default function ToolDetails(props: {tool: Tool | undefined}): ReactNode {
  const {tool} = props;

  if (!tool) return <DetailText>Tool details are unavailable.</DetailText>;

  switch (tool.kind) {
    case "command":
      return CommandToolDetails({tool});
    case "file-read":
      return ReadToolDetails({tool});
    case "file-edit":
    case "file-write":
      return FileMutationToolDetails({tool});
    case "web-fetch":
      return WebFetchToolDetails({tool});
    // NOTE: Readonly tools such as list and find are supported but never exposed to the agent by Pi, so we don't have a custom UI yet.
    default:
      return <DefaultToolDetails tool={tool} />;
  }
}
