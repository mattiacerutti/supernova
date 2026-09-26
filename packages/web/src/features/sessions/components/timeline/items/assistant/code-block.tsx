import {Suspense, use, useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import ContentPanel from "@/features/sessions/components/timeline/items/content-panel";
import {CODE_HIGHLIGHT_THEMES, getCachedHighlightedCode, highlightCode} from "@/lib/diffs/highlighter";
import {useSettingsStore} from "@/stores/settings-store";

const SHIKI_CLASS_NAME =
  "scroll-fade-x overflow-x-auto [&_pre]:m-0 [&_pre]:min-w-full [&_pre]:w-max [&_pre]:p-0 [&_pre]:!bg-transparent [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:leading-6";

interface HighlightedCodeProps {
  readonly code: string;
  readonly language?: string;
}

function HighlightedCode(props: HighlightedCodeProps) {
  const {code, language} = props;
  const mode = useSettingsStore((state) => state.resolvedMode);
  const theme = CODE_HIGHLIGHT_THEMES[mode];
  const cachedHtml = getCachedHighlightedCode({code, language, theme});

  if (cachedHtml) {
    return <div className={SHIKI_CLASS_NAME} dangerouslySetInnerHTML={{__html: cachedHtml}} />;
  }

  const html = use(highlightCode({code, language, theme}));

  return <div className={SHIKI_CLASS_NAME} dangerouslySetInnerHTML={{__html: html}} />;
}

interface PlainCodeProps {
  readonly code: string;
}

function PlainCode(props: PlainCodeProps) {
  const {code} = props;

  return (
    <div className={SHIKI_CLASS_NAME}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

interface CodeBlockProps {
  readonly code: string;
  readonly language?: string;
}

/** Fenced code with a copy button. Highlights asynchronously and shows plain text until then. */
export default function CodeBlock(props: CodeBlockProps) {
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
