import {createHighlighterCore} from "shiki/core";
import type {HighlighterCore, LanguageRegistration, ThemeRegistrationResolved} from "shiki/core";
import {createJavaScriptRegexEngine} from "shiki/engine/javascript";

export interface HighlightRequest {
  readonly id: number;
  readonly code: string;
  /**
   * The main thread resolves grammars and themes (Pierre loads them only there) and sends each in full once; after
   * that it names them (empty `data`, theme name). `null` renders as plain text.
   */
  readonly language: {readonly name: string; readonly data: LanguageRegistration[]} | null;
  readonly theme: ThemeRegistrationResolved | string;
}

export interface HighlightResponse {
  readonly id: number;
  /** `null` when highlighting failed; the caller falls back to the main thread. */
  readonly html: string | null;
}

// The same engine the main thread uses, so the markup is identical; only the regex-heavy tokenizing moves here.
const highlighter: Promise<HighlighterCore> = createHighlighterCore({engine: createJavaScriptRegexEngine(), langs: [], themes: []});

self.addEventListener("message", (event: MessageEvent<HighlightRequest>) => {
  const {code, id, language, theme} = event.data;
  void highlighter
    .then((instance) => {
      if (typeof theme !== "string") instance.loadThemeSync(theme);
      if (language && language.data.length > 0) instance.loadLanguageSync(language.data);
      return instance.codeToHtml(code, {lang: language?.name ?? "text", theme: typeof theme === "string" ? theme : theme.name});
    })
    .then(
      (html) => self.postMessage({id, html} satisfies HighlightResponse),
      () => self.postMessage({id, html: null} satisfies HighlightResponse)
    );
});
