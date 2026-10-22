import Markdown from "react-markdown";
import type {Components} from "react-markdown";
import remarkGfm from "remark-gfm";
import {LRUCache} from "lru-cache";
import {isValidElement} from "react";
import type {ComponentProps, ReactElement} from "react";
import CodeBlock from "@/features/sessions/components/timeline/items/assistant/code-block";
import {segmentStreamingMessage} from "@/features/sessions/lib/timeline/message/message-segments";
import {cn} from "@/lib/cn";

function languageFromClassName(className: string | undefined): string | undefined {
  return className?.match(/language-([^\s]+)/)?.[1];
}

const remarkPlugins = [remarkGfm];

// Module-level, so every cached tree uses the same element types and reconciles against any other.
const components: Components = {
  a: ({children, href, ...linkProps}) => (
    <a className="text-ink underline decoration-border-strong underline-offset-4 transition hover:decoration-ink-muted" href={href} rel="noreferrer" target="_blank" {...linkProps}>
      {children}
    </a>
  ),
  blockquote: ({children}) => <blockquote className="my-4 border-l border-border pl-3 text-ink-muted">{children}</blockquote>,
  code: ({children, className, ...codeProps}) => {
    const language = languageFromClassName(className);
    return (
      <code className={cn(language ? "font-mono text-[13px]" : "rounded bg-overlay-pressed px-1 py-0.5 font-mono text-xs text-ink", className)} {...codeProps}>
        {children}
      </code>
    );
  },
  h1: ({children}) => <h1 className="mb-3 mt-5 text-base font-semibold text-ink first:mt-0">{children}</h1>,
  h2: ({children}) => <h2 className="mb-3 mt-5 text-sm font-semibold text-ink first:mt-0">{children}</h2>,
  h3: ({children}) => <h3 className="mb-2 mt-4 text-sm font-medium text-ink first:mt-0">{children}</h3>,
  hr: () => <hr className="my-6 border-border-muted" />,
  li: ({children}) => <li className="my-1 pl-1 marker:text-ink-faint">{children}</li>,
  ol: ({children}) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  p: ({children}) => <p className="mb-3 whitespace-pre-wrap last:mb-0">{children}</p>,
  pre: ({children}) => {
    const codeElement = isValidElement<ComponentProps<"code">>(children) ? children : undefined;
    const code = String(codeElement?.props.children ?? "").replace(/\n$/, "");

    return <CodeBlock code={code} language={languageFromClassName(codeElement?.props.className)} />;
  },
  table: ({children}) => (
    <div className="my-4 overflow-hidden rounded-xl border border-border-muted">
      <div className="scroll-fade-x overflow-x-auto" data-scrollable>
        <table className="w-full border-collapse text-left text-sm">{children}</table>
      </div>
    </div>
  ),
  td: ({children}) => <td className="border-t border-border-muted px-3 py-2 text-ink">{children}</td>,
  th: ({children}) => <th className="px-3 py-2 font-medium text-ink">{children}</th>,
  ul: ({children}) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
};

/**
 * Parsed trees by source. Messages are immutable once settled and a streaming head only changes at a paragraph
 * boundary, so a hit skips parsing on remounts and returns the same element, which lets React skip the subtree.
 */
const markdownCache = new LRUCache<string, ReactElement>({max: 1_000, maxSize: 1_500_000, sizeCalculation: (_tree, source) => Math.max(1, source.length)});

function renderMarkdown(source: string): ReactElement {
  let tree = markdownCache.get(source);
  if (!tree) {
    // `Markdown` is a pure function of its options with no hooks, so its tree can be produced and reused here.
    tree = Markdown({children: source, components, remarkPlugins});
    markdownCache.set(source, tree);
  }
  return tree;
}

interface StreamingFadeTextProps {
  readonly children: string;
}

function StreamingFadeText(props: StreamingFadeTextProps) {
  const {children} = props;

  // Only the recent tail is split into keyed spans so CSS can fade new chunks; older text stays one node.
  const chunkStartIndex = Math.max(0, Math.floor((children.length - 160) / 8) * 8);
  const chunks: Array<{index: number; text: string}> = [];

  for (let index = chunkStartIndex; index < children.length; index += 8) {
    chunks.push({index, text: children.slice(index, index + 8)});
  }

  return (
    <>
      {children.slice(0, chunkStartIndex)}
      {chunks.map((chunk) => (
        <span className="animate-[session-stream-fade-in_300ms_ease-out_both] motion-reduce:animate-none" key={chunk.index}>
          {chunk.text}
        </span>
      ))}
    </>
  );
}

interface AssistantMessageContentProps {
  readonly children: string;
  readonly className?: string;
  readonly fadeNewText?: boolean;
  readonly mode?: "markdown" | "text";
  readonly streaming?: boolean;
}

export default function AssistantMessageContent(props: AssistantMessageContentProps) {
  const {children, className, fadeNewText = false, mode = "markdown", streaming = false} = props;

  if (streaming) {
    // Trailing newlines would render as a blank line that vanishes on settle.
    const segments = segmentStreamingMessage(children.replace(/\s+$/, ""));

    return (
      <div className="space-y-3">
        {segments.map((segment, index) => (
          <AssistantMessageContent className={className} fadeNewText={segment.mode === "text"} key={`${segment.mode}-${index}`} mode={segment.mode}>
            {segment.text}
          </AssistantMessageContent>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("session-markdown min-w-0 max-w-full text-sm leading-7 text-ink", className)}>
      {mode === "text" && <div className="whitespace-pre-wrap">{fadeNewText ? <StreamingFadeText>{children}</StreamingFadeText> : children}</div>}
      {mode === "markdown" && renderMarkdown(children)}
    </div>
  );
}
