import type {HighlighterTypes} from "@pierre/diffs";

export const CODE_HIGHLIGHT_ENGINE: HighlighterTypes = "shiki-js";

export const CODE_HIGHLIGHT_THEMES = {
  dark: "github-dark",
  light: "github-light",
} as const;
