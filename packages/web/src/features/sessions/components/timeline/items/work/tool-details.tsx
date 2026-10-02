import type {ReactNode} from "react";
import DiffViewer from "@/features/workspace/components/file-viewer/diff-viewer";
import ContentPanel from "@/features/sessions/components/timeline/items/content-panel";
import {parseFilePatch} from "@/lib/diffs/parse-patch";
import {fileName, hasToolDetails, toolOutputText, toolView} from "@/features/sessions/lib/timeline/work/tool-details";
import type {ToolView} from "@/features/sessions/lib/timeline/work/tool-details";
import type {SessionToolCall} from "@/features/sessions/types/session-turn";
import {cn} from "@/lib/cn";

type ViewOf<Kind extends ToolView["kind"]> = Extract<ToolView, {kind: Kind}>;

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** A failed call's message: Pi puts it in the result's content. */
function errorText(tool: SessionToolCall): string | undefined {
  return tool.status === "error" ? (toolOutputText(tool) ?? "Tool failed.") : undefined;
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
  readonly tool: SessionToolCall;
  readonly view: ViewOf<"custom" | "file-list" | "file-find">;
}

function DefaultToolDetails(props: DefaultToolDetailsProps) {
  const {tool, view} = props;
  const output = tool.status === "completed" ? toolOutputText(tool) : undefined;
  const details = view.kind === "custom" && tool.status === "completed" ? view.details : undefined;
  const error = errorText(tool);

  return (
    <div className="space-y-2">
      {tool.arguments && <ContentPanel className="font-mono">{formatJson(tool.arguments)}</ContentPanel>}
      {output && <ContentPanel className="font-mono">{output}</ContentPanel>}
      {details !== undefined && <ContentPanel className="font-mono">{formatJson(details)}</ContentPanel>}
      {error && <DetailText className="text-danger-ink">{error}</DetailText>}
    </div>
  );
}

interface CommandToolDetailsProps {
  readonly tool: SessionToolCall;
  readonly view: ViewOf<"command">;
}

function CommandToolDetails(props: CommandToolDetailsProps) {
  const {tool, view} = props;

  if (view.command === undefined) {
    return null;
  }

  const output = view.output;
  const hasOutput = output !== undefined && output.length > 0;

  return (
    <ContentPanel className="p-0 text-sm font-mono" scrollable={false}>
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-ink-muted">
        <span>Shell</span>
      </div>
      <div className="scroll-fade max-h-72 overflow-auto overscroll-contain" data-scrollable>
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          <pre className="whitespace-pre-wrap wrap-break-word text-ink">$ {view.command}</pre>
          {hasOutput && <pre className={cn("whitespace-pre-wrap wrap-break-word", tool.status === "error" ? "text-danger-ink" : "text-ink-muted")}>{output}</pre>}
          {tool.status === "completed" && view.truncated && <DetailText className="mt-2 font-sans">Output was truncated.</DetailText>}
        </div>
      </div>
    </ContentPanel>
  );
}

interface ReadToolDetailsProps {
  readonly tool: SessionToolCall;
  readonly view: ViewOf<"file-read">;
}

function ReadToolDetails(props: ReadToolDetailsProps) {
  const {tool, view} = props;

  if (view.path === undefined || !hasToolDetails(tool)) return null;
  const error = errorText(tool);

  return (
    <div className="space-y-2">
      {tool.status === "completed" && view.truncated && <DetailText>Read output was truncated.</DetailText>}
      {error && <DetailText className="text-danger-ink">{error}</DetailText>}
    </div>
  );
}

interface WebFetchToolDetailsProps {
  readonly view: ViewOf<"web-fetch">;
}

function WebFetchToolDetails(props: WebFetchToolDetailsProps) {
  const {view} = props;

  if (!view.url) {
    return null;
  }

  return <DetailText>{view.url}</DetailText>;
}

interface FileMutationToolDetailsProps {
  readonly tool: SessionToolCall;
  readonly view: ViewOf<"file-edit" | "file-write">;
}

function FileMutationToolDetails(props: FileMutationToolDetailsProps) {
  const {tool, view} = props;

  if (view.path === undefined || tool.status === "pending") {
    return null;
  }

  const {patch, path} = view;
  const fileDiff = patch ? parseFilePatch({patch, path}) : undefined;
  const error = errorText(tool);

  return (
    <ContentPanel className="p-0 text-sm" scrollable={false}>
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5 font-sans text-sm text-ink-muted">
        <span className="min-w-0 truncate">{fileName(path)}</span>
      </div>
      <div className="scroll-fade max-h-72 overflow-auto overscroll-contain" data-scrollable>
        {fileDiff && <DiffViewer fileDiff={fileDiff} key={patch} />}
        {error && <p className="px-2.5 pb-2.5 text-sm leading-none text-danger-ink">{error}</p>}
      </div>
    </ContentPanel>
  );
}

interface ToolDetailsProps {
  readonly tool: SessionToolCall;
}

export default function ToolDetails(props: ToolDetailsProps): ReactNode {
  const {tool} = props;
  const view = toolView(tool);

  switch (view.kind) {
    case "command":
      return CommandToolDetails({tool, view});
    case "file-read":
      return ReadToolDetails({tool, view});
    case "file-edit":
    case "file-write":
      return FileMutationToolDetails({tool, view});
    case "web-fetch":
      return WebFetchToolDetails({view});
    // NOTE: Readonly tools such as list and find have no custom UI yet.
    default:
      return <DefaultToolDetails tool={tool} view={view} />;
  }
}
