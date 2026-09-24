import type {ReactNode} from "react";
import FileIcon from "@/features/workspace/components/file-tree/file-icon";
import {fileName, readLineRange, skillName} from "@/features/sessions/lib/timeline/tool-details";
import {cn} from "@/lib/cn";
import type {Tool} from "@supernova/contracts/sessions/schemas";

type ToolOf<Kind extends Tool["kind"]> = Extract<Tool, {kind: Kind}>;

/** Present participle while the tool runs, past tense once it has finished or failed. */
function verb(tool: Tool, running: string, done: string): string {
  return tool.status === "pending" ? running : done;
}

function singleLine(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

function diffStats(patch: string): {readonly additions: number; readonly deletions: number} {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return {additions, deletions};
}

/** The tool's verb. Takes the row's color, so errors tint it. */
function Label(props: {children: ReactNode}) {
  return <span className="shrink-0">{props.children}</span>;
}

/** What the tool acted on. Quieter than the label until the row is hovered. */
function Argument(props: {children: ReactNode; className?: string}) {
  const {children, className} = props;
  return <span className={cn("flex min-w-0 items-baseline gap-1 text-ink-faint transition-colors group-hover/row:text-ink-muted", className)}>{children}</span>;
}

function FileArgument(props: {children?: ReactNode; path: string | undefined}) {
  const {children, path} = props;
  if (!path) return null;

  return (
    <Argument>
      <FileIcon className="size-3.5 translate-y-0.5 opacity-80" path={path} />
      <span className="min-w-0 truncate">{fileName(path)}</span>
      {children}
    </Argument>
  );
}

function TextArgument(props: {children: string; mono?: boolean}) {
  const {children, mono = false} = props;
  if (!children) return null;

  return (
    <Argument className={cn(mono && "font-mono text-[0.8125rem]")}>
      <span className="min-w-0 truncate">{children}</span>
    </Argument>
  );
}

function CommandTitle(props: {tool: ToolOf<"command">}) {
  const {tool} = props;
  return (
    <>
      <Label>{verb(tool, "Running", "Ran")}</Label>
      <TextArgument mono>{singleLine(tool.input?.command ?? "")}</TextArgument>
    </>
  );
}

function ReadTitle(props: {tool: ToolOf<"file-read">}) {
  const {tool} = props;
  const skill = tool.input ? skillName(tool.input.path) : undefined;
  if (skill !== undefined) {
    return (
      <>
        <Label>{verb(tool, "Loading skill", "Loaded skill")}</Label>
        <TextArgument>{skill}</TextArgument>
      </>
    );
  }

  const range = tool.input ? readLineRange(tool.input) : undefined;
  return (
    <>
      <Label>{verb(tool, "Reading", "Read")}</Label>
      <FileArgument path={tool.input?.path}>{range && <span className="shrink-0 font-mono text-xs tabular-nums">{range}</span>}</FileArgument>
    </>
  );
}

function FileMutationTitle(props: {tool: ToolOf<"file-edit" | "file-write">}) {
  const {tool} = props;
  const stats = tool.status === "completed" ? diffStats(tool.result.patch) : undefined;

  return (
    <>
      <Label>{tool.kind === "file-edit" ? verb(tool, "Editing", "Edited") : verb(tool, "Writing", "Wrote")}</Label>
      <FileArgument path={tool.input?.path}>
        {stats && (
          <span className="flex shrink-0 gap-1 font-mono text-xs tabular-nums">
            <span className="text-diff-added">+{stats.additions}</span>
            <span className="text-diff-removed">-{stats.deletions}</span>
          </span>
        )}
      </FileArgument>
    </>
  );
}

function ListTitle(props: {tool: ToolOf<"file-list">}) {
  const {tool} = props;
  return (
    <>
      <Label>{verb(tool, "Listing", "Listed")}</Label>
      <TextArgument>{tool.input?.path ?? ""}</TextArgument>
    </>
  );
}

function FindTitle(props: {tool: ToolOf<"file-find">}) {
  const {tool} = props;
  const target = tool.input ? (tool.input.path ? `${tool.input.pattern} in ${tool.input.path}` : tool.input.pattern) : "";
  return (
    <>
      <Label>{verb(tool, "Searching", "Searched")}</Label>
      <TextArgument>{singleLine(target)}</TextArgument>
    </>
  );
}

function FetchTitle(props: {tool: ToolOf<"web-fetch">}) {
  const {tool} = props;
  return (
    <>
      <Label>{verb(tool, "Fetching", "Fetched")}</Label>
      <TextArgument>{tool.input?.url ?? (tool.status === "completed" ? tool.result.url : "")}</TextArgument>
    </>
  );
}

function CustomTitle(props: {tool: ToolOf<"custom">}) {
  const {tool} = props;
  return (
    <>
      <Label>{verb(tool, "Calling", "Called")}</Label>
      <TextArgument>{tool.name}</TextArgument>
    </>
  );
}

/** A tool row's label and argument. Each tool kind owns its own title. */
export default function ToolTitle(props: {tool: Tool | undefined}) {
  const {tool} = props;

  switch (tool?.kind) {
    case "command":
      return <CommandTitle tool={tool} />;
    case "file-read":
      return <ReadTitle tool={tool} />;
    case "file-edit":
    case "file-write":
      return <FileMutationTitle tool={tool} />;
    case "file-list":
      return <ListTitle tool={tool} />;
    case "file-find":
      return <FindTitle tool={tool} />;
    case "web-fetch":
      return <FetchTitle tool={tool} />;
    case "custom":
      return <CustomTitle tool={tool} />;
    default:
      return <Label>Tool</Label>;
  }
}
