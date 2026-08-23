import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {Suspense, isValidElement, use, useState} from "react";
import type {ComponentProps, ReactNode} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import ContentPanel from "@/features/sessions/components/timeline/items/assistant/content-panel";
import {segmentStreamingMessage} from "@/features/sessions/lib/streaming/message-segments";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import {CODE_HIGHLIGHT_THEMES, getCachedHighlightedCode, highlightCode} from "@/lib/code-highlighting";
import {cn} from "@/lib/cn";

const SHIKI_CLASS_NAME =
  "scroll-fade-x overflow-x-auto [&_pre]:m-0 [&_pre]:min-w-full [&_pre]:w-max [&_pre]:p-0 [&_pre]:!bg-transparent [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:leading-6";

function languageFromClassName(className: string | undefined): string | undefined {
  return className?.match(/language-([^\s]+)/)?.[1];
}

function HighlightedCode(props: {code: string; language?: string}) {
  const {code, language} = props;
  const mode = useAppearanceStore((state) => state.resolvedMode);
  const theme = CODE_HIGHLIGHT_THEMES[mode];
  const cachedHtml = getCachedHighlightedCode({code, language, theme});

  if (cachedHtml) {
    return <div className={SHIKI_CLASS_NAME} dangerouslySetInnerHTML={{__html: cachedHtml}} />;
  }

  const html = use(highlightCode({code, language, theme}));

  return <div className={SHIKI_CLASS_NAME} dangerouslySetInnerHTML={{__html: html}} />;
}

function PlainCode(props: {code: string}) {
  const {code} = props;

  return (
    <div className={SHIKI_CLASS_NAME}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function CodeBlock(props: {children: ReactNode; code: string; language?: string}) {
  const {code, language} = props;
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <ContentPanel className="group/code my-4 p-2.5" scrollable={false}>
      <div className="mb-1.5 flex items-center justify-between font-sans text-sm text-ink-muted">
        <span>{language ?? "text"}</span>
        <Button
          className="inline-flex w-auto items-center gap-1.5 px-2 py-1 text-xs text-ink-muted opacity-0 hover:text-ink group-hover/code:opacity-100 focus-visible:opacity-100"
          onClick={handleCopy}
          variant="primary"
        >
          <Icon name={copied ? "check" : "copy"} size="xs" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Suspense fallback={<PlainCode code={code} />}>
        <HighlightedCode code={code} language={language} />
      </Suspense>
    </ContentPanel>
  );
}

interface StreamingFadeTextProps {
  readonly children: string;
}

function StreamingFadeText(props: StreamingFadeTextProps) {
  const {children} = props;

  // Split only the recent live-text tail into small keyed spans so CSS can fade
  // newly mounted chunks without React state. Older text stays in one plain text
  // node to avoid reconciling an unbounded number of animated spans.
  // The 160-char window keeps the animated tail to about one short paragraph,
  // while 8-char chunks keep fades visible without creating too many spans.
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
  children: string;
  className?: string;
  fadeNewText?: boolean;
  mode?: "markdown" | "text";
  streaming?: boolean;
}

export default function AssistantMessageContent(props: AssistantMessageContentProps) {
  const {children, className, fadeNewText = false, mode = "markdown", streaming = false} = props;

  if (streaming) {
    const segments = segmentStreamingMessage(children);

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
      {mode === "markdown" && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({children: linkChildren, href, ...linkProps}) => (
              <a
                className="text-ink underline decoration-border-strong underline-offset-4 transition hover:decoration-ink-muted"
                href={href}
                rel="noreferrer"
                target="_blank"
                {...linkProps}
              >
                {linkChildren}
              </a>
            ),
            blockquote: ({children: quoteChildren}) => <blockquote className="my-4 border-l border-border pl-3 text-ink-muted">{quoteChildren}</blockquote>,
            code: ({children: codeChildren, className: codeClassName, ...codeProps}) => {
              const language = languageFromClassName(codeClassName);
              return (
                <code className={cn(language ? "font-mono text-[13px]" : "rounded bg-overlay-pressed px-1 py-0.5 font-mono text-xs text-ink", codeClassName)} {...codeProps}>
                  {codeChildren}
                </code>
              );
            },
            h1: ({children: headingChildren}) => <h1 className="mb-3 mt-5 text-base font-semibold text-ink first:mt-0">{headingChildren}</h1>,
            h2: ({children: headingChildren}) => <h2 className="mb-3 mt-5 text-sm font-semibold text-ink first:mt-0">{headingChildren}</h2>,
            h3: ({children: headingChildren}) => <h3 className="mb-2 mt-4 text-sm font-medium text-ink first:mt-0">{headingChildren}</h3>,
            hr: () => <hr className="my-6 border-border-muted" />,
            li: ({children: listItemChildren}) => <li className="my-1 pl-1 marker:text-ink-faint">{listItemChildren}</li>,
            ol: ({children: listChildren}) => <ol className="my-3 list-decimal space-y-1 pl-6">{listChildren}</ol>,
            p: ({children: paragraphChildren}) => <p className="mb-3 whitespace-pre-wrap last:mb-0">{paragraphChildren}</p>,
            pre: ({children: preChildren}) => {
              const codeElement = isValidElement<ComponentProps<"code">>(preChildren) ? preChildren : undefined;
              const code = String(codeElement?.props.children ?? "").replace(/\n$/, "");

              return (
                <CodeBlock code={code} language={languageFromClassName(codeElement?.props.className)}>
                  {preChildren}
                </CodeBlock>
              );
            },
            table: ({children: tableChildren}) => (
              <div className="my-4 overflow-hidden rounded-xl border border-border-muted">
                <div className="scroll-fade-x overflow-x-auto" data-scrollable>
                  <table className="w-full border-collapse text-left text-sm">{tableChildren}</table>
                </div>
              </div>
            ),
            td: ({children: cellChildren}) => <td className="border-t border-border-muted px-3 py-2 text-ink">{cellChildren}</td>,
            th: ({children: cellChildren}) => <th className="px-3 py-2 font-medium text-ink">{cellChildren}</th>,
            ul: ({children: listChildren}) => <ul className="my-3 list-disc space-y-1 pl-6">{listChildren}</ul>,
          }}
        >
          {children}
        </ReactMarkdown>
      )}
    </div>
  );
}
