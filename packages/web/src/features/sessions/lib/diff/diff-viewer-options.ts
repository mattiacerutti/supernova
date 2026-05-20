import type {FileDiffOptions} from "@pierre/diffs";
import {CODE_HIGHLIGHT_THEMES} from "@/lib/code-highlighting";

export const SUPERNOVA_DIFF_VIEW_CSS = `
[data-diff] {
  --diffs-light-bg: rgb(38 38 38);
  --diffs-dark-bg: rgb(38 38 38);
  --diffs-bg: rgb(38 38 38);
  --diffs-bg-buffer: rgb(38 38 38);
  --diffs-bg-context: rgb(38 38 38);
  --diffs-bg-hover: rgb(255 255 255 / 0.04);
  --diffs-bg-separator: rgb(38 38 38);
  --diffs-bg-deletion: rgb(248 113 113 / 0.12);
  --diffs-bg-deletion-number: rgb(248 113 113 / 0.16);
  --diffs-bg-deletion-emphasis: rgb(248 113 113 / 0.18);
  --diffs-bg-addition: rgb(52 211 153 / 0.12);
  --diffs-bg-addition-number: rgb(52 211 153 / 0.16);
  --diffs-bg-addition-emphasis: rgb(52 211 153 / 0.18);
  --diffs-deletion-base: rgb(248 113 113);
  --diffs-addition-base: rgb(52 211 153);
  --diffs-fg: rgb(212 212 216);
  --diffs-fg-number: rgb(113 113 122);
  --diffs-font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --diffs-font-size: 0.8125rem;
  --diffs-line-height: 1.5rem;
  --diffs-gap-block: 0;
  --diffs-min-number-column-width: 3ch;
  background: rgb(38 38 38) !important;
}

pre,
code,
[data-diff],
[data-gutter],
[data-content] {
  background-color: rgb(38 38 38) !important;
}

[data-diff] [data-code] {
  background-color: rgb(38 38 38) !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

[data-diff] [data-line],
[data-diff] [data-line] span {
  background-color: transparent !important;
}

[data-diff] [data-column-number] {
  background-color: rgb(38 38 38) !important;
  color: rgb(113 113 122) !important;
  user-select: none;
}

[data-diff][data-background] [data-line-type='change-addition'][data-line] {
  background-color: rgb(52 211 153 / 0.12) !important;
}

[data-diff][data-background] [data-line-type='change-deletion'][data-line] {
  background-color: rgb(248 113 113 / 0.12) !important;
}

[data-diff][data-background] [data-line-type='change-addition'][data-column-number] {
  background-color: rgb(52 211 153 / 0.16) !important;
}

[data-diff][data-background] [data-line-type='change-deletion'][data-column-number] {
  background-color: rgb(248 113 113 / 0.16) !important;
}

[data-diff] [data-line] {
  padding-right: 0.625rem;
}

[data-diff] [data-separator] {
  display: none !important;
}
`;

/** Creates Pierre diff viewer options styled to match Supernova's dark UI. */
export function generateDiffOptions<T>(): FileDiffOptions<T> {
  return {
    diffIndicators: "bars",
    diffStyle: "unified",
    disableFileHeader: true,
    hunkSeparators: "simple",
    lineDiffType: "none",
    overflow: "wrap",
    theme: CODE_HIGHLIGHT_THEMES.dark,
    themeType: "dark",
    unsafeCSS: SUPERNOVA_DIFF_VIEW_CSS,
  };
}
