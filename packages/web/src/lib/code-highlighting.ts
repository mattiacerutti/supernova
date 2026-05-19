import {getSharedHighlighter} from "@pierre/diffs";
import type {DiffsHighlighter, SupportedLanguages} from "@pierre/diffs";
import {LRUCache} from "lru-cache";
import murmurHash from "imurmurhash";

const MAX_HIGHLIGHT_CACHE_ENTRIES = 500;
const MAX_HIGHLIGHT_CACHE_MEMORY_BYTES = 50 * 1024 * 1024;

export const CODE_HIGHLIGHT_THEMES = {
  dark: "pierre-dark",
  light: "pierre-light",
} as const;

export type CodeHighlightTheme = (typeof CODE_HIGHLIGHT_THEMES)[keyof typeof CODE_HIGHLIGHT_THEMES];

// Stores completed highlighted HTML so stable messages do not re-tokenize; bounded because code blocks can be large.
const highlightedCodeCache = new LRUCache<string, string>({
  max: MAX_HIGHLIGHT_CACHE_ENTRIES,
  maxSize: MAX_HIGHLIGHT_CACHE_MEMORY_BYTES,
  sizeCalculation: (html, cacheKey) => estimateHighlightedCodeSize(html, cacheKey),
});

// Stores in-flight highlight work so Suspense retries do not start duplicate highlighting for the same block.
const pendingCodeHighlightingCache = new Map<string, Promise<string>>();

// Stores highlighter setup by language because Pierre/Shiki grammar and theme initialization could become expensive.
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
    preferredHighlighter: "shiki-js",
    themes: [CODE_HIGHLIGHT_THEMES.dark, CODE_HIGHLIGHT_THEMES.light],
  }).catch((error) => {
    highlighterByLanguageCache.delete(language);
    if (language === "text") throw error;
    return getHighlighterPromise("text");
  });

  highlighterByLanguageCache.set(language, promise);
  return promise;
}

interface HighlightedCodeHtmlInput {
  code: string;
  language?: string;
  theme?: CodeHighlightTheme;
}

/** Reads already-highlighted code HTML without starting new highlighting work. */
export function getCachedHighlightedCode(input: HighlightedCodeHtmlInput): string | undefined {
  const language = normalizeCodeLanguage(input.language);
  const theme = input.theme ?? CODE_HIGHLIGHT_THEMES.dark;

  const key = getCacheKey({code: input.code, language, theme});

  return highlightedCodeCache.get(key);
}

/** Highlights code to HTML with the shared Pierre/Shiki highlighter and caches the result. */
export function highlightCode(input: HighlightedCodeHtmlInput): Promise<string> {
  const language = normalizeCodeLanguage(input.language);
  const theme = input.theme ?? CODE_HIGHLIGHT_THEMES.dark;

  const key = getCacheKey({code: input.code, language, theme});
  const pending = pendingCodeHighlightingCache.get(key);
  if (pending) return pending;

  const highlighted = getHighlighterPromise(language)
    .then((highlighter): string => {
      try {
        return highlighter.codeToHtml(input.code, {lang: language, theme});
      } catch {
        return highlighter.codeToHtml(input.code, {lang: "text", theme});
      }
    })
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
