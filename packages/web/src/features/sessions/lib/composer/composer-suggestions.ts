import type {Editor} from "@tiptap/core";
import {Node} from "@tiptap/core";
import type {ComposerSuggestionMatch, ComposerSuggestionTriggerKind} from "@/features/sessions/types/composer-suggestion";
import {PluginKey} from "@tiptap/pm/state";
import {Suggestion} from "@tiptap/suggestion";

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

/**
 * Creates a TipTap extension for handling suggestion functionality.
 * @param onMatch - Callback function to handle a suggestion match.
 * @returns The created TipTap extension.
 */
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
