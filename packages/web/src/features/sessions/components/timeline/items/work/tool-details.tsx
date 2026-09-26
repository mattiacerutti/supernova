import type {ReactNode} from "react";
import DiffViewer from "@/features/workspace/components/file-viewer/diff-viewer";
import ContentPanel from "@/features/sessions/components/timeline/items/content-panel";
import {parseFilePatch} from "@/lib/diffs/parse-patch";
import {fileName, hasToolDetails} from "@/features/sessions/lib/timeline/work/tool-details";
import {cn} from "@/lib/cn";
import type {Tool} from "@supernova/contracts/sessions/schemas";

type FileMutationTool = Extract<Tool, {kind: "file-edit" | "file-write"}>;

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

interface DetailTextProps {
  readonly children: ReactNode;
  readonly className?: string;
}

function DetailText(props: DetailTextProps) {
  const {children, className} = props;
  return <p className={cn("min-w-0 wrap-break-word text-sm leading-none text-ink-muted", className)}>{children}</p>;
}

interface DefaultToolDetailsProps {
  readonly tool: Tool;
}

function DefaultToolDetails(props: DefaultToolDetailsProps) {
  const {tool} = props;

  return (
    <div className="space-y-2">
      {tool.input && <ContentPanel className="font-mono">{formatJson(tool.input)}</ContentPanel>}
      {tool.kind === "custom" && tool.status === "completed" && (
        <>
          {tool.result.output && <ContentPanel className="font-mono">{tool.result.output}</ContentPanel>}
          {tool.result.data !== undefined && <ContentPanel className="font-mono">{formatJson(tool.result.data)}</ContentPanel>}
        </>
      )}
      {tool.status === "error" && <DetailText className="text-danger-ink">{tool.error}</DetailText>}
    </div>
  );
}

interface CommandToolDetailsProps {
  readonly tool: Extract<Tool, {kind: "command"}>;
}

function CommandToolDetails(props: CommandToolDetailsProps) {
  const {tool} = props;

  if (tool.input === undefined) {
    return null;
  }

  const output = tool.status === "completed" ? tool.result.output : tool.status === "error" ? tool.error : undefined;
  const hasOutput = output !== undefined && output.length > 0;

  return (
    <ContentPanel className="p-0 text-sm font-mono" scrollable={false}>
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-ink-muted">
        <span>Shell</span>
      </div>
      <div className="scroll-fade max-h-72 overflow-auto overscroll-contain" data-scrollable>
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          <pre className="whitespace-pre-wrap wrap-break-word text-ink">$ {tool.input.command}</pre>
          {hasOutput && <pre className={cn("whitespace-pre-wrap wrap-break-word", tool.status === "error" ? "text-danger-ink" : "text-ink-muted")}>{output}</pre>}
          {tool.status === "completed" && tool.result.truncated && <DetailText className="mt-2 font-sans">Output was truncated.</DetailText>}
        </div>
      </div>
    </ContentPanel>
  );
}

interface ReadToolDetailsProps {
  readonly tool: Extract<Tool, {kind: "file-read"}>;
}

function ReadToolDetails(props: ReadToolDetailsProps) {
  const {tool} = props;

  if (tool.input === undefined || !hasToolDetails(tool)) return null;

  return (
    <div className="space-y-2">
      {tool.status === "completed" && tool.result.truncated && <DetailText>Read output was truncated.</DetailText>}
      {tool.status === "error" && <DetailText className="text-danger-ink">{tool.error}</DetailText>}
    </div>
  );
}

interface WebFetchToolDetailsProps {
  readonly tool: Extract<Tool, {kind: "web-fetch"}>;
}

function WebFetchToolDetails(props: WebFetchToolDetailsProps) {
  const {tool} = props;

  const url = tool.input?.url ?? (tool.status === "completed" ? tool.result.url : undefined);

  if (!url) {
    return null;
  }

  return <DetailText>{url}</DetailText>;
}

interface FileMutationToolDetailsProps {
  readonly tool: FileMutationTool;
}

function FileMutationToolDetails(props: FileMutationToolDetailsProps) {
  const {tool} = props;

  if (tool.input === undefined || tool.status === "pending") {
    return null;
  }

  const path = tool.input?.path;
  const patch = tool.status === "completed" ? tool.result.patch : undefined;
  const fileDiff = patch ? parseFilePatch({patch, path}) : undefined;

  return (
    <ContentPanel className="p-0 text-sm" scrollable={false}>
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-ink-muted">
        <span className="min-w-0 truncate">{fileName(path)}</span>
      </div>
      <div className="scroll-fade max-h-72 overflow-auto overscroll-contain" data-scrollable>
        {fileDiff && <DiffViewer fileDiff={fileDiff} key={patch} />}
        {tool.status === "error" && <p className="px-2.5 pb-2.5 text-sm leading-none text-danger-ink">{tool.error}</p>}
      </div>
    </ContentPanel>
  );
}

interface ToolDetailsProps {
  readonly tool: Tool | undefined;
}

export default function ToolDetails(props: ToolDetailsProps): ReactNode {
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
