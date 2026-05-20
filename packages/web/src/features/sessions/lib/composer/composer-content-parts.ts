import type {SessionUserMessageContentPart, SessionUserMessageReferencePart} from "@supernova/contracts/sessions/schemas";
import type {Editor, JSONContent} from "@tiptap/react";

function contentPartValue(part: SessionUserMessageContentPart): string {
  return part.type === "text" ? part.text : part.value;
}

/** Converts mixed text/reference composer parts into their plain text representation. */
export function textFromComposerContentParts(parts: readonly SessionUserMessageContentPart[]): string {
  return parts.map(contentPartValue).join("");
}

/** Trims only leading and trailing text while preserving reference parts and internal spacing. */
export function trimComposerContentParts(parts: readonly SessionUserMessageContentPart[]): readonly SessionUserMessageContentPart[] {
  return parts
    .map((part, index): SessionUserMessageContentPart => {
      if (part.type === "reference") return part;

      const startTrimmed = index === 0 ? part.text.trimStart() : part.text;
      const text = index === parts.length - 1 ? startTrimmed.trimEnd() : startTrimmed;
      return {text, type: "text"};
    })
    .filter((part) => part.type === "reference" || part.text.length > 0);
}

type ReferenceNodeAttributes = Omit<SessionUserMessageReferencePart, "type">;

/**
 * Creates a TipTap node representing a reference content part.
 */
export function createReferenceNode(part: SessionUserMessageReferencePart): JSONContent {
  return {
    attrs: {
      id: part.id,
      kind: part.kind,
      subtitle: part.subtitle,
      title: part.title,
      value: part.value,
    } satisfies ReferenceNodeAttributes,
    type: "composerReference",
  };
}

function pushTextContentPart(parts: SessionUserMessageContentPart[], text: string): void {
  if (!text) return;

  const previous = parts.at(-1);
  if (previous?.type === "text") {
    parts[parts.length - 1] = {...previous, text: `${previous.text}${text}`};
    return;
  }

  parts.push({text, type: "text"});
}

/**
 * Converts TipTap editor's content to an array of content parts.
 */
export function editorToContentParts(editor: Editor): readonly SessionUserMessageContentPart[] {
  const parts: SessionUserMessageContentPart[] = [];

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
