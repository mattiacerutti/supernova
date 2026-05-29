import type {UserMessageContentPart, UserMessageReferencePart} from "@supernova/contracts/sessions/schemas";
import type {Editor, JSONContent} from "@tiptap/react";

function contentPartValue(part: UserMessageContentPart): string {
  if (part.type === "text") return part.text;
  if (part.type === "reference") return part.value;
  return "";
}

function pushTextContentPart(parts: UserMessageContentPart[], text: string): void {
  if (!text) return;

  const previous = parts.at(-1);
  if (previous?.type === "text") {
    parts[parts.length - 1] = {...previous, text: `${previous.text}${text}`};
    return;
  }

  parts.push({text, type: "text"});
}

/** Converts mixed text/reference composer parts into their plain text representation. */
export function textFromComposerContentParts(parts: readonly UserMessageContentPart[]): string {
  return parts.map(contentPartValue).join("");
}

/** Trims only leading and trailing text while preserving reference parts and internal spacing. */
export function trimComposerContentParts(parts: readonly UserMessageContentPart[]): readonly UserMessageContentPart[] {
  return parts
    .map((part, index): UserMessageContentPart => {
      if (part.type !== "text") return part;

      const startTrimmed = index === 0 ? part.text.trimStart() : part.text;
      const text = index === parts.length - 1 ? startTrimmed.trimEnd() : startTrimmed;
      return {text, type: "text"};
    })
    .filter((part) => part.type !== "text" || part.text.length > 0);
}

/** Converts persisted text/reference content parts into TipTap editor content. */
export function contentPartsToEditorContent(parts: readonly UserMessageContentPart[]): JSONContent {
  const content: JSONContent[] = [];

  for (const part of parts) {
    if (part.type === "attachment") continue;

    if (part.type === "reference") {
      content.push(createReferenceNode(part));
      continue;
    }

    const lines = part.text.split("\n");
    for (const [index, line] of lines.entries()) {
      if (index > 0) content.push({type: "hardBreak"});
      if (line.length > 0) content.push({text: line, type: "text"});
    }
  }

  return {content: [{content, type: "paragraph"}], type: "doc"};
}

type ReferenceNodeAttributes = Omit<UserMessageReferencePart, "type">;

/**
 * Creates a TipTap node representing a reference content part.
 */
export function createReferenceNode(part: UserMessageReferencePart): JSONContent {
  return {
    attrs: {
      id: part.id,
      kind: part.kind,
      name: part.name,
      value: part.value,
    } satisfies ReferenceNodeAttributes,
    type: "composerReference",
  };
}

/**
 * Converts TipTap editor's content to an array of content parts.
 */
export function editorToContentParts(editor: Editor): readonly UserMessageContentPart[] {
  const parts: UserMessageContentPart[] = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === "text") {
      pushTextContentPart(parts, node.text ?? "");
      return;
    }

    if (node.type.name === "hardBreak") {
      pushTextContentPart(parts, "\n");
      return;
    }

    if (node.type.name === "composerReference") {
      parts.push({...(node.attrs as ReferenceNodeAttributes), type: "reference"});
    }
  });

  return parts;
}
