import {matchSorter} from "match-sorter";
import type {ComposerSuggestionItem, ComposerSuggestionTriggerKind as ResourceTriggerKind} from "@supernova/contracts/sessions/procedures";
import type {Editor} from "@tiptap/core";
import {Node} from "@tiptap/core";
import type {ComposerSuggestionMatch, ComposerSuggestionTriggerKind} from "@/features/sessions/types/composer-suggestion";
import {PluginKey} from "@tiptap/pm/state";
import {Suggestion} from "@tiptap/suggestion";
import type {SuggestionOptions} from "@tiptap/suggestion";

const MAX_SUGGESTIONS = 50;

function isTokenBoundary(value: string | undefined): boolean {
  return value === undefined || /\s/.test(value);
}

function createSuggestionPlugin(input: {
  char: string;
  editor: Editor;
  kind: ComposerSuggestionTriggerKind;
  onMatch: (match: ComposerSuggestionMatch | null) => void;
  pluginKey: string;
  startOfLine?: boolean;
}) {
  const {char, editor, kind, onMatch: onMatchChange, pluginKey, startOfLine = false} = input;

  return Suggestion({
    allowedPrefixes: startOfLine ? null : [" ", "\n"],
    char,
    editor,
    findSuggestionMatch: findComposerSuggestionMatch({char, startOfLine}),
    items: () => [],
    pluginKey: new PluginKey(pluginKey),
    render: () => ({
      onExit: () => onMatchChange(null),
      onStart: (props) =>
        onMatchChange({
          from: props.range.from,
          kind,
          opener: char,
          query: props.query,
          to: props.range.to,
        }),
      onUpdate: (props) =>
        onMatchChange({
          from: props.range.from,
          kind,
          opener: char,
          query: props.query,
          to: props.range.to,
        }),
    }),
    startOfLine,
  });
}

/** Filters the full resource snapshot locally, applying the display limit after searching. */
export function filterComposerSuggestions(items: readonly ComposerSuggestionItem[], kind: ResourceTriggerKind, query: string): ComposerSuggestionItem[] {
  const candidates = items.filter((item) => (kind === "skill" ? item.kind === "skill" : item.kind !== "skill"));
  const normalizedQuery = query.trim();
  return (
    normalizedQuery
      ? matchSorter(candidates, normalizedQuery, {
          keys: [(item) => ("name" in item ? item.name : item.title), (item) => item.subtitle ?? "", (item) => (item.kind === "prompt-template" ? item.prompt : "")],
        })
      : candidates
  ).slice(0, MAX_SUGGESTIONS);
}

/** Creates a TipTap suggestion matcher that expands from the cursor to token boundaries. */
export function findComposerSuggestionMatch(input: {char: string; startOfLine: boolean}): NonNullable<SuggestionOptions["findSuggestionMatch"]> {
  return ({$position}) => {
    const text = $position.parent.textBetween(0, $position.parent.content.size, "\n", "\n");
    const cursor = $position.parentOffset;

    let tokenStart = cursor;
    while (tokenStart > 0 && !isTokenBoundary(text[tokenStart - 1])) {
      tokenStart -= 1;
    }

    if (text[tokenStart] !== input.char) return null;
    if (input.startOfLine && tokenStart !== 0) return null;
    if (!input.startOfLine && tokenStart > 0 && ![" ", "\n"].includes(text[tokenStart - 1] ?? "")) return null;

    let tokenEnd = cursor;
    while (tokenEnd < text.length && !isTokenBoundary(text[tokenEnd])) {
      tokenEnd += 1;
    }

    const query = text.slice(tokenStart + input.char.length, tokenEnd);
    const from = $position.start() + tokenStart;
    const to = $position.start() + tokenEnd;

    return {
      query,
      range: {from, to},
      text: text.slice(tokenStart, tokenEnd),
    };
  };
}

/** Creates the TipTap extension that reports file, skill, and slash-command suggestion matches. */
export function createSuggestionExtension(onMatch: (match: ComposerSuggestionMatch | null) => void) {
  return Node.create({
    addProseMirrorPlugins() {
      return [
        createSuggestionPlugin({char: "@", editor: this.editor, kind: "file", onMatch: onMatch, pluginKey: "composer-file-suggestion"}),
        createSuggestionPlugin({char: "$", editor: this.editor, kind: "skill", onMatch: onMatch, pluginKey: "composer-skill-suggestion"}),
        createSuggestionPlugin({char: "/", editor: this.editor, kind: "slash", onMatch: onMatch, pluginKey: "composer-slash-suggestion", startOfLine: true}),
      ];
    },
    name: "composerSuggestions",
  });
}
