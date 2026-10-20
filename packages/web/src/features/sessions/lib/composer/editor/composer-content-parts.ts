import type {UserMessageAttachmentPart, UserMessageContentPart, UserMessageReferencePart} from "@supernova/contracts/services/sessions/schemas";
import type {Editor, JSONContent} from "@tiptap/react";
import {Slice, type ResolvedPos} from "@tiptap/pm/model";

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

export function editableComposerContentParts(parts: readonly UserMessageContentPart[]): readonly UserMessageContentPart[] {
  return parts.filter((part) => part.type !== "attachment");
}

export function attachmentComposerContentParts(parts: readonly UserMessageContentPart[]): readonly UserMessageAttachmentPart[] {
  return parts.filter((part): part is UserMessageAttachmentPart => part.type === "attachment");
}

export function textFromComposerContentParts(parts: readonly UserMessageContentPart[]): string {
  return parts.map(contentPartValue).join("");
}

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

/** The default clipboard parser collapses consecutive newlines into one paragraph boundary. */
export function parseComposerClipboardText(text: string, context: ResolvedPos): Slice {
  const content = contentPartsToEditorContent([{type: "text", text: text.replace(/\r\n?/g, "\n")}]);
  return Slice.maxOpen(context.doc.type.schema.nodeFromJSON(content).content);
}

type ReferenceNodeAttributes = Omit<UserMessageReferencePart, "type">;

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

export function editorToContentParts(editor: Editor): readonly UserMessageContentPart[] {
  const parts: UserMessageContentPart[] = [];

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "paragraph" && position > 0) {
      pushTextContentPart(parts, "\n");
    }

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
