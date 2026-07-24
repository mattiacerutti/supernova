import type {FileDiffOptions} from "@pierre/diffs";
import {CODE_HIGHLIGHT_THEMES} from "@/lib/code-highlighting";

const SUPERNOVA_DIFF_VIEW_CSS = `
[data-diff] {
  --diffs-light-bg: var(--theme-surface);
  --diffs-dark-bg: var(--theme-surface);
  --diffs-bg: var(--theme-surface);
  --diffs-bg-buffer: var(--theme-surface);
  --diffs-bg-context: var(--theme-surface);
  --diffs-bg-hover: var(--theme-overlay-hover);
  --diffs-bg-separator: var(--theme-surface);
  --diffs-bg-deletion: color-mix(in srgb, var(--theme-diff-removed) 12%, transparent);
  --diffs-bg-deletion-number: color-mix(in srgb, var(--theme-diff-removed) 16%, transparent);
  --diffs-bg-deletion-emphasis: color-mix(in srgb, var(--theme-diff-removed) 18%, transparent);
  --diffs-bg-addition: color-mix(in srgb, var(--theme-diff-added) 12%, transparent);
  --diffs-bg-addition-number: color-mix(in srgb, var(--theme-diff-added) 16%, transparent);
  --diffs-bg-addition-emphasis: color-mix(in srgb, var(--theme-diff-added) 18%, transparent);
  --diffs-deletion-base: var(--theme-diff-removed);
  --diffs-addition-base: var(--theme-diff-added);
  --diffs-fg: var(--theme-ink);
  --diffs-fg-number: var(--theme-ink-muted);
  --diffs-font-family: var(--font-mono);
  --diffs-font-size: 0.8125rem;
  --diffs-line-height: 1.5rem;
  --diffs-gap-block: 0;
  --diffs-min-number-column-width: 3ch;
  background: var(--theme-surface) !important;
}

pre,
code,
[data-diff],
[data-gutter],
[data-content] {
  background-color: var(--theme-surface) !important;
}

[data-diff] [data-code] {
  background-color: var(--theme-surface) !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

[data-diff] [data-line],
[data-diff] [data-line] span {
  background-color: transparent !important;
}

[data-diff] [data-column-number] {
  background-color: var(--theme-surface) !important;
  color: var(--theme-ink-muted) !important;
  user-select: none;
}

[data-diff][data-background] [data-line-type='change-addition'][data-line] {
  background-color: color-mix(in srgb, var(--theme-diff-added) 12%, transparent) !important;
}

[data-diff][data-background] [data-line-type='change-deletion'][data-line] {
  background-color: color-mix(in srgb, var(--theme-diff-removed) 12%, transparent) !important;
}

[data-diff][data-background] [data-line-type='change-addition'][data-column-number] {
  background-color: color-mix(in srgb, var(--theme-diff-added) 16%, transparent) !important;
}

[data-diff][data-background] [data-line-type='change-deletion'][data-column-number] {
  background-color: color-mix(in srgb, var(--theme-diff-removed) 16%, transparent) !important;
}

[data-diff] [data-line] {
  padding-right: 0.625rem;
}

[data-diff] [data-separator] {
  display: none !important;
}
`;

/** Creates Pierre diff viewer options styled to match the active appearance. */
export function generateDiffOptions<T>(mode: "dark" | "light"): FileDiffOptions<T> {
  return {
    diffIndicators: "bars",
    diffStyle: "unified",
    disableFileHeader: true,
    hunkSeparators: "simple",
    lineDiffType: "none",
    overflow: "wrap",
    theme: CODE_HIGHLIGHT_THEMES[mode],
    themeType: mode,
    unsafeCSS: SUPERNOVA_DIFF_VIEW_CSS,
  };
}
