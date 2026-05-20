import {useState} from "react";
import type {ReactNode} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import TranscriptBlock from "@/features/sessions/components/messages/transcript-block";
import {getWorkIconName, getWorkSummary} from "@/features/sessions/lib/session-timeline/work-timeline-items";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";
import type {SessionTool} from "@supernova/contracts/sessions/schemas";

export type ToolDetailMode = "collapsible" | "visible";

type ToolEvent = Extract<SessionWorkEvent, {type: "tool"}>;

function fileName(path: string | undefined): string {
  if (!path) return "unknown file";
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
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
  const path = tool.input?.path;

  const lineWindow = [
    tool.input?.offset !== undefined ? `from line ${tool.input.offset}` : undefined,
    tool.input?.limit !== undefined ? ` to ${tool.input.limit}` : undefined,
  ].filter(Boolean);

  return (
    <div className="space-y-2">
      <DetailText>
        Read {fileName(path)}
        {lineWindow.length > 0 && <span> ({lineWindow})</span>}
      </DetailText>
      {tool.status === "completed" && tool.result.truncated && <DetailText>Read output was truncated.</DetailText>}
      {tool.status === "error" && <DetailText className="text-red-300">{tool.error}</DetailText>}
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
    // NOTE: Readonly tools such as list and find are supported but never exposed to the agent by Pi, so we don't have a custom UI yet.
    // TODO: Need diff UI for file-edit tools
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
    <div className="min-w-0 text-sm">
      {mode === "collapsible" ? (
        <Button
          aria-expanded={showDetails}
          className="group flex w-full min-w-0 items-center gap-2 px-0 py-0 text-left text-neutral-600 hover:text-neutral-500"
          onClick={handleToggle}
          variant="ghost"
        >
          {title}
          <Icon className={cn("transition-transform duration-160 ease-out", showDetails && "rotate-90")} name="chevron-right" size="xs" />
        </Button>
      ) : (
        <div className="flex min-w-0 items-start gap-2 text-neutral-600">{title}</div>
      )}
      <div
        className={cn(
          "min-w-0 ",
          mode === "collapsible"
            ? "grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-240 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100 data-[expanded=true]:mt-2"
            : "mt-2"
        )}
        data-expanded={showDetails}
      >
        <div className="min-w-0 overflow-hidden ">
          <ToolDetails tool={event.tool} />
        </div>
      </div>
    </div>
  );
}
