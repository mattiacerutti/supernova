import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {Suspense, isValidElement, use, useState} from "react";
import type {ComponentProps, ReactNode} from "react";
import {codeToHtml} from "shiki";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {segmentStreamingMessage} from "@/features/sessions/lib/streaming/message-segments";
import {cn} from "@/lib/cn";

const highlightedCodeCache = new Map<string, Promise<string>>();

function languageFromClassName(className: string | undefined): string | undefined {
  return className?.match(/language-([^\s]+)/)?.[1];
}

function normalizedLanguage(language?: string): string {
  if (!language) return "text";
  if (language === "sh") return "bash";
  if (language === "yml") return "yaml";
  return language;
}

function highlightedCodeHtml(code: string, language?: string): Promise<string> {
  const resolvedLanguage = normalizedLanguage(language);
  const cacheKey = `${resolvedLanguage}:${code}`;
  const cached = highlightedCodeCache.get(cacheKey);
  if (cached) return cached;

  const highlighted = codeToHtml(code, {
    lang: resolvedLanguage,
    theme: "github-dark",
  }).catch(() =>
    codeToHtml(code, {
      lang: "text",
      theme: "github-dark",
    })
  );
  highlightedCodeCache.set(cacheKey, highlighted);
  return highlighted;
}

function HighlightedCode(props: {code: string; language?: string}) {
  const {code, language} = props;
  const html = use(highlightedCodeHtml(code, language));

  return <div className="session-markdown-shiki" dangerouslySetInnerHTML={{__html: html}} />;
}

function CodeBlock(props: {children: ReactNode; code: string; language?: string}) {
  const {children, code, language} = props;
  const [copied, setCopied] = useState(false);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="group/code my-4 overflow-hidden rounded-xl border border-white/8 bg-[#111111]">
      <div className="flex h-9 items-center justify-between border-b border-white/7 bg-white/3 px-3">
        <span className="font-mono text-xs text-neutral-500">{language ?? "text"}</span>
        <Button
          className="inline-flex w-auto items-center gap-1.5 px-2 py-1 text-xs text-neutral-500 opacity-0 hover:text-neutral-200 group-hover/code:opacity-100 focus-visible:opacity-100"
          onClick={handleCopy}
          variant="primary"
        >
          <Icon name={copied ? "check" : "copy"} size="xs" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <Suspense fallback={<pre className="overflow-x-auto p-3 text-[13px] leading-6 text-neutral-200">{children}</pre>}>
        <HighlightedCode code={code} language={language} />
      </Suspense>
    </div>
  );
}

interface IMessageContentProps {
  children: string;
  className?: string;
  mode?: "markdown" | "text";
  streaming?: boolean;
}

export default function MessageContent(props: IMessageContentProps) {
  const {children, className, mode = "markdown", streaming = false} = props;

  if (streaming) {
    const segments = segmentStreamingMessage(children);

    return (
      <div className="space-y-3">
        {segments.map((segment, index) => (
          <MessageContent className={className} key={`${segment.mode}-${index}-${segment.text.length}`} mode={segment.mode}>
            {segment.text}
          </MessageContent>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("session-markdown min-w-0 max-w-full text-sm leading-7 text-neutral-200", className)}>
      {mode === "text" && <div className="whitespace-pre-wrap">{children}</div>}
      {mode === "markdown" && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({children: linkChildren, href, ...linkProps}) => (
              <a
                className="text-neutral-200 underline decoration-white/25 underline-offset-4 transition hover:decoration-white/60"
                href={href}
                rel="noreferrer"
                target="_blank"
                {...linkProps}
              >
                {linkChildren}
              </a>
            ),
            blockquote: ({children: quoteChildren}) => <blockquote className="my-4 border-l border-white/12 pl-3 text-neutral-400">{quoteChildren}</blockquote>,
            code: ({children: codeChildren, className: codeClassName, ...codeProps}) => {
              const language = languageFromClassName(codeClassName);
              return (
                <code className={cn(language ? "font-mono text-[13px]" : "rounded bg-white/8 px-1 py-0.5 font-mono text-xs text-neutral-200", codeClassName)} {...codeProps}>
                  {codeChildren}
                </code>
              );
            },
            h1: ({children: headingChildren}) => <h1 className="mb-3 mt-5 text-base font-semibold text-neutral-200 first:mt-0">{headingChildren}</h1>,
            h2: ({children: headingChildren}) => <h2 className="mb-3 mt-5 text-sm font-semibold text-neutral-200 first:mt-0">{headingChildren}</h2>,
            h3: ({children: headingChildren}) => <h3 className="mb-2 mt-4 text-sm font-medium text-neutral-200 first:mt-0">{headingChildren}</h3>,
            hr: () => <hr className="my-6 border-white/8" />,
            li: ({children: listItemChildren}) => <li className="my-1 pl-1 marker:text-neutral-600">{listItemChildren}</li>,
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
              <div className="my-4 overflow-x-auto rounded-xl border border-white/8">
                <table className="w-full border-collapse text-left text-sm">{tableChildren}</table>
              </div>
            ),
            td: ({children: cellChildren}) => <td className="border-t border-white/7 px-3 py-2 text-neutral-300">{cellChildren}</td>,
            th: ({children: cellChildren}) => <th className="px-3 py-2 font-medium text-neutral-200">{cellChildren}</th>,
            ul: ({children: listChildren}) => <ul className="my-3 list-disc space-y-1 pl-6">{listChildren}</ul>,
          }}
        >
          {children}
        </ReactMarkdown>
      )}
    </div>
  );
}
