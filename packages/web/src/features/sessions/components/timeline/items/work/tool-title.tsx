import type {ReactNode} from "react";
import FileIcon from "@/features/workspace/components/file-tree/file-icon";
import {fileName, readLineRange, skillName, toolView} from "@/features/sessions/lib/timeline/work/tool-details";
import type {ToolView} from "@/features/sessions/lib/timeline/work/tool-details";
import type {SessionToolCall} from "@/features/sessions/types/session-turn";
import {cn} from "@/lib/cn";

type ViewOf<Kind extends ToolView["kind"]> = Extract<ToolView, {kind: Kind}>;

/** Present participle while the tool runs, past tense once it has finished or failed. */
function verb(pending: boolean, running: string, done: string): string {
  return pending ? running : done;
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

interface LabelProps {
  readonly children: ReactNode;
}

/** The tool's verb. Takes the row's color, so errors tint it. */
function Label(props: LabelProps) {
  return <span className="shrink-0">{props.children}</span>;
}

interface ArgumentProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** What the tool acted on. Quieter than the label until the row is hovered. */
function Argument(props: ArgumentProps) {
  const {children, className} = props;
  return <span className={cn("flex min-w-0 items-baseline gap-1 text-ink-faint transition-colors group-hover/row:text-ink-muted", className)}>{children}</span>;
}

interface FileArgumentProps {
  readonly children?: ReactNode;
  readonly path: string | undefined;
}

function FileArgument(props: FileArgumentProps) {
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

interface TextArgumentProps {
  readonly children: string;
  readonly mono?: boolean;
}

function TextArgument(props: TextArgumentProps) {
  const {children, mono = false} = props;
  if (!children) return null;

  return (
    <Argument className={cn(mono && "font-mono text-[0.8125rem]")}>
      <span className="min-w-0 truncate">{children}</span>
    </Argument>
  );
}

interface CommandTitleProps {
  readonly pending: boolean;
  readonly view: ViewOf<"command">;
}

function CommandTitle(props: CommandTitleProps) {
  const {pending, view} = props;
  return (
    <>
      <Label>{verb(pending, "Running", "Ran")}</Label>
      <TextArgument mono>{singleLine(view.command ?? "")}</TextArgument>
    </>
  );
}

interface ReadTitleProps {
  readonly pending: boolean;
  readonly view: ViewOf<"file-read">;
}

function ReadTitle(props: ReadTitleProps) {
  const {pending, view} = props;
  const skill = view.path === undefined ? undefined : skillName(view.path);
  if (skill !== undefined) {
    return (
      <>
        <Label>{verb(pending, "Loading skill", "Loaded skill")}</Label>
        <TextArgument>{skill}</TextArgument>
      </>
    );
  }

  const range =
    view.path === undefined ? undefined : readLineRange({...(view.limit === undefined ? {} : {limit: view.limit}), ...(view.offset === undefined ? {} : {offset: view.offset})});
  return (
    <>
      <Label>{verb(pending, "Reading", "Read")}</Label>
      <FileArgument path={view.path}>{range && <span className="shrink-0 font-mono text-xs tabular-nums">{range}</span>}</FileArgument>
    </>
  );
}

interface FileMutationTitleProps {
  readonly pending: boolean;
  readonly view: ViewOf<"file-edit" | "file-write">;
}

function FileMutationTitle(props: FileMutationTitleProps) {
  const {pending, view} = props;
  const stats = view.patch === undefined ? undefined : diffStats(view.patch);

  return (
    <>
      <Label>{view.kind === "file-edit" ? verb(pending, "Editing", "Edited") : verb(pending, "Writing", "Wrote")}</Label>
      <FileArgument path={view.path}>
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

interface ListTitleProps {
  readonly pending: boolean;
  readonly view: ViewOf<"file-list">;
}

function ListTitle(props: ListTitleProps) {
  const {pending, view} = props;
  return (
    <>
      <Label>{verb(pending, "Listing", "Listed")}</Label>
      <TextArgument>{view.path ?? ""}</TextArgument>
    </>
  );
}

interface FindTitleProps {
  readonly pending: boolean;
  readonly view: ViewOf<"file-find">;
}

function FindTitle(props: FindTitleProps) {
  const {pending, view} = props;
  const target = view.path ? `${view.pattern ?? ""} in ${view.path}` : (view.pattern ?? "");
  return (
    <>
      <Label>{verb(pending, "Searching", "Searched")}</Label>
      <TextArgument>{singleLine(target)}</TextArgument>
    </>
  );
}

interface FetchTitleProps {
  readonly pending: boolean;
  readonly view: ViewOf<"web-fetch">;
}

function FetchTitle(props: FetchTitleProps) {
  const {pending, view} = props;
  return (
    <>
      <Label>{verb(pending, "Fetching", "Fetched")}</Label>
      <TextArgument>{view.url ?? ""}</TextArgument>
    </>
  );
}

interface CustomTitleProps {
  readonly pending: boolean;
  readonly view: ViewOf<"custom">;
}

function CustomTitle(props: CustomTitleProps) {
  const {pending, view} = props;
  return (
    <>
      <Label>{verb(pending, "Calling", "Called")}</Label>
      <TextArgument>{view.name}</TextArgument>
    </>
  );
}

interface ToolTitleProps {
  readonly tool: SessionToolCall;
}

/** A tool row's label and argument. Each tool kind owns its own title. */
export default function ToolTitle(props: ToolTitleProps) {
  const {tool} = props;
  const view = toolView(tool);
  const pending = tool.status === "pending";

  switch (view.kind) {
    case "command":
      return <CommandTitle pending={pending} view={view} />;
    case "file-read":
      return <ReadTitle pending={pending} view={view} />;
    case "file-edit":
    case "file-write":
      return <FileMutationTitle pending={pending} view={view} />;
    case "file-list":
      return <ListTitle pending={pending} view={view} />;
    case "file-find":
      return <FindTitle pending={pending} view={view} />;
    case "web-fetch":
      return <FetchTitle pending={pending} view={view} />;
    case "custom":
      return <CustomTitle pending={pending} view={view} />;
  }
}
