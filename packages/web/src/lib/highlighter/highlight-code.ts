import {getResolvedOrResolveTheme, getSharedHighlighter} from "@pierre/diffs";
import type {DiffsHighlighter, SupportedLanguages, ThemedFileResult} from "@pierre/diffs";
import {toHtml} from "hast-util-to-html";
import {LRUCache} from "lru-cache";
import murmurHash from "imurmurhash";
import {CODE_HIGHLIGHT_ENGINE, CODE_HIGHLIGHT_THEMES} from "@/lib/highlighter/constants";
import {getHighlightWorkerPool} from "@/lib/highlighter/worker-pool";

const MAX_HIGHLIGHT_CACHE_ENTRIES = 500;
const MAX_HIGHLIGHT_CACHE_MEMORY_BYTES = 50 * 1024 * 1024;

type CodeHighlightTheme = (typeof CODE_HIGHLIGHT_THEMES)[keyof typeof CODE_HIGHLIGHT_THEMES];

const highlightedCodeCache = new LRUCache<string, string>({
  max: MAX_HIGHLIGHT_CACHE_ENTRIES,
  maxSize: MAX_HIGHLIGHT_CACHE_MEMORY_BYTES,
  sizeCalculation: (html, cacheKey) => estimateHighlightedCodeSize(html, cacheKey),
});

const pendingCodeHighlightingCache = new Map<string, Promise<string>>();

const highlighterByLanguageCache = new Map<string, Promise<DiffsHighlighter>>();

function normalizeCodeLanguage(language?: string): string {
  if (!language) return "text";
  if (language === "gitignore") return "ini";
  if (language === "sh" || language === "shell") return "bash";
  if (language === "yml") return "yaml";
  return language;
}

function getCacheKey(input: Required<Pick<HighlightedCodeHtmlInput, "code" | "language" | "theme">>): string {
  const codeHash = murmurHash(input.code).result().toString(36);
  return `${codeHash}:${input.code.length}:${input.language}:${input.theme}`;
}

function estimateHighlightedCodeSize(html: string, code: string): number {
  return Math.max(html.length * 2, code.length * 3);
}

function plainCodeHtml(code: string): string {
  const escapedCode = code.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

  return `<pre><code>${escapedCode}</code></pre>`;
}

function getHighlighterPromise(language: string): Promise<DiffsHighlighter> {
  const cached = highlighterByLanguageCache.get(language);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    langs: [language as SupportedLanguages],
    preferredHighlighter: CODE_HIGHLIGHT_ENGINE,
    themes: [CODE_HIGHLIGHT_THEMES.dark, CODE_HIGHLIGHT_THEMES.light],
  }).catch((error) => {
    highlighterByLanguageCache.delete(language);
    if (language === "text") throw error;
    return getHighlighterPromise("text");
  });

  highlighterByLanguageCache.set(language, promise);
  return promise;
}

function highlightOnMainThread(input: {readonly code: string; readonly language: string; readonly theme: CodeHighlightTheme}): Promise<string> {
  return getHighlighterPromise(input.language).then((highlighter): string => {
    try {
      return highlighter.codeToHtml(input.code, {lang: input.language, theme: input.theme});
    } catch {
      return highlighter.codeToHtml(input.code, {lang: "text", theme: input.theme});
    }
  });
}

/** Pierre's highlighted lines, wrapped as Shiki's `codeToHtml` wraps them, so both paths produce the same markup. */
async function shikiHtml(lines: ThemedFileResult["code"], theme: CodeHighlightTheme): Promise<string> {
  const {bg, fg, name} = await getResolvedOrResolveTheme(theme);
  const children = lines.flatMap((line, index) => {
    // Pierre gives an empty line a newline so its row keeps a height; Shiki leaves the line's span empty.
    const empty = line.type === "element" && line.children.length === 1 && line.children[0]?.type === "text" && line.children[0].value === "\n";
    const span = {type: "element", tagName: "span", properties: {class: "line"}, children: empty || line.type !== "element" ? [] : line.children} as const;
    return index === 0 ? [span] : [{type: "text", value: "\n"} as const, span];
  });
  return toHtml({
    type: "element",
    tagName: "pre",
    properties: {class: `shiki ${name}`, style: `background-color:${bg};color:${fg}`, tabindex: "0"},
    children: [{type: "element", tagName: "code", properties: {}, children}],
  });
}

/** `undefined` when the pool cannot highlight this block as the main thread would, which then does. */
async function highlightInPool(input: {readonly code: string; readonly key: string; readonly language: string; readonly theme: CodeHighlightTheme}): Promise<string | undefined> {
  if (input.language === "text") return undefined;
  const pool = await getHighlightWorkerPool(input.theme === CODE_HIGHLIGHT_THEMES.dark ? "dark" : "light");
  if (!pool) return undefined;
  const {theme, tokenizeMaxLineLength} = pool.getFileRenderOptions();
  // The pool leaves lines this long untokenized, and a theme switch may still be applying.
  if (theme !== input.theme || input.code.split("\n").some((line) => line.length >= tokenizeMaxLineLength)) return undefined;
  const file = {cacheKey: `code-block:${input.key}`, contents: input.code, lang: input.language as SupportedLanguages, name: ""};
  await pool.primeFileHighlightCache(file);
  const lines = pool.getFileResultCache(file)?.result.code;
  // Our cache keeps the markup; leaving the lines in the pool's would push out the diffs it caches.
  pool.evictFileFromCache(file.cacheKey);
  return lines && shikiHtml(lines, input.theme);
}

interface HighlightedCodeHtmlInput {
  readonly code: string;
  readonly language?: string;
  readonly theme?: CodeHighlightTheme;
}

export function getCachedHighlightedCode(input: HighlightedCodeHtmlInput): string | undefined {
  const language = normalizeCodeLanguage(input.language);
  const theme = input.theme ?? CODE_HIGHLIGHT_THEMES.dark;

  const key = getCacheKey({code: input.code, language, theme});

  return highlightedCodeCache.get(key);
}

export function highlightCode(input: HighlightedCodeHtmlInput): Promise<string> {
  const language = normalizeCodeLanguage(input.language);
  const theme = input.theme ?? CODE_HIGHLIGHT_THEMES.dark;

  const key = getCacheKey({code: input.code, language, theme});
  const pending = pendingCodeHighlightingCache.get(key);
  if (pending) return pending;

  const highlighted = highlightInPool({code: input.code, key, language, theme})
    .catch(() => undefined)
    .then((html) => html ?? highlightOnMainThread({code: input.code, language, theme}))
    .catch(() => plainCodeHtml(input.code))
    .then((html) => {
      highlightedCodeCache.set(key, html, {size: estimateHighlightedCodeSize(html, input.code)});
      return html;
    })
    .finally(() => {
      pendingCodeHighlightingCache.delete(key);
    });

  pendingCodeHighlightingCache.set(key, highlighted);

  return highlighted;
}
