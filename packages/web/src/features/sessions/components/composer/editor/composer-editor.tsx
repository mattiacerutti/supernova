import {EditorContent} from "@tiptap/react";
import type {Editor, JSONContent} from "@tiptap/core";
import type {ClipboardEvent} from "react";
import ComposerSuggestionMenu from "@/features/sessions/components/composer/suggestions/composer-suggestion-menu";
import {useComposerSuggestions} from "@/features/sessions/hooks/api/use-composer-suggestions";
import type {ComposerSuggestionItem, ComposerSuggestionMatch} from "@/features/sessions/types/composer-suggestion";
import {cn} from "@/lib/cn";
import {createReferenceNode} from "@/features/sessions/lib/composer/composer-content-parts";

function suggestionText(item: ComposerSuggestionItem): string {
  if (item.kind !== "prompt-template") return "";

  return item.prompt;
}

function suggestionReferenceContent(item: ComposerSuggestionItem): JSONContent[] | null {
  if (item.kind !== "file" && item.kind !== "skill") return null;

  const value = item.kind === "file" ? item.path : item.name;

  return [
    createReferenceNode({
      id: `part_${crypto.randomUUID()}`,
      kind: item.kind,
      name: item.title,
      type: "reference",
      value,
    }),
    {text: " ", type: "text"},
  ];
}

function insertSuggestion(editor: Editor, match: ComposerSuggestionMatch, item: ComposerSuggestionItem): void {
  const referenceContent = suggestionReferenceContent(item);

  if (referenceContent) {
    editor.chain().focus().insertContentAt({from: match.from, to: match.to}, referenceContent).run();
  }

  const text = suggestionText(item);

  if (text) {
    editor.commands.setContent(text);
  }
}

interface ComposerEditorProps {
  readonly className?: string;
  readonly editor: Editor | null;
  readonly suggestionMatch: ComposerSuggestionMatch | null;
  readonly onSuggestionMatchChange: (match: ComposerSuggestionMatch | null) => void;
  readonly onPaste: (event: ClipboardEvent<HTMLElement> | globalThis.ClipboardEvent) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly projectPath: string;
  readonly value: string;
}

export default function ComposerEditor(props: ComposerEditorProps) {
  const {className, editor, onPaste, onSubmit, onSuggestionMatchChange, placeholder, projectPath, suggestionMatch, value} = props;

  const suggestionQuery = useComposerSuggestions(projectPath, suggestionMatch);

  const suggestionOpen = Boolean(suggestionMatch);

  const selectSuggestion = (item: ComposerSuggestionItem): void => {
    if (!suggestionMatch) return;

    if (item.kind === "slash-command") {
      editor?.chain().focus().deleteRange({from: suggestionMatch.from, to: suggestionMatch.to}).run();
      item.onSelect();
      onSuggestionMatchChange(null);
      return;
    }

    if (editor) insertSuggestion(editor, suggestionMatch, item);
    onSuggestionMatchChange(null);
  };

  const handlePasteCapture = (event: ClipboardEvent<HTMLElement>): void => {
    onPaste(event);
  };

  return (
    <div onPasteCapture={handlePasteCapture}>
      <ComposerSuggestionMenu onSelect={selectSuggestion} onSubmit={onSubmit} open={suggestionOpen} query={suggestionQuery}>
        <EditorContent className={cn("relative z-10", className)} editor={editor} />
        {value.length === 0 && <div className="pointer-events-none absolute inset-x-0 top-0 p-1 text-sm font-light leading-5 text-white/25">{placeholder}</div>}
      </ComposerSuggestionMenu>
    </div>
  );
}
