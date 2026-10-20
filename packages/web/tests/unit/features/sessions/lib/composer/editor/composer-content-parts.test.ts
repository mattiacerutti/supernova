import {getSchema, type JSONContent} from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type {Editor} from "@tiptap/react";
import {EditorState, TextSelection} from "@tiptap/pm/state";
import {describe, expect, it} from "vitest";
import {
  contentPartsToEditorContent,
  createReferenceNode,
  editorToContentParts,
  parseComposerClipboardText,
  textFromComposerContentParts,
  trimComposerContentParts,
} from "@/features/sessions/lib/composer/editor/composer-content-parts";

function mockEditor(nodes: readonly {readonly attrs?: Record<string, unknown>; readonly text?: string; readonly type: {readonly name: string}}[]): Editor {
  return {
    state: {
      doc: {
        descendants: (visitor: (node: (typeof nodes)[number]) => void) => {
          nodes.forEach(visitor);
        },
      },
    },
  } as unknown as Editor;
}

describe("composer content parts", () => {
  it.each([
    {name: "pasted paragraphs", paragraphs: ["concern:", "1. First", "2. Second", "Please"], expected: "concern:\n1. First\n2. Second\nPlease"},
    {name: "empty paragraphs", paragraphs: ["concern:", "", "1. First", "", "Please"], expected: "concern:\n\n1. First\n\nPlease"},
    {name: "leading empty paragraph", paragraphs: ["", "Please"], expected: "\nPlease"},
  ])("preserves line breaks between $name", ({paragraphs, expected}) => {
    const schema = getSchema([Document, Paragraph, Text, HardBreak]);
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: paragraphs.map((text): JSONContent => ({type: "paragraph", content: text ? [{type: "text", text}] : []})),
    });
    const editor = {state: {doc}} as Editor;

    expect(editorToContentParts(editor)).toEqual([{type: "text", text: expected}]);
  });

  it.each([
    {name: "blank lines and numbered items", text: "concern:\n\n1. First\n2. Second\n\nPlease\nIn order", expected: "concern:\n\n1. First\n2. Second\n\nPlease\nIn order"},
    {name: "Windows newlines", text: "First\r\n\r\nSecond", expected: "First\n\nSecond"},
    {name: "carriage returns", text: "First\r\rSecond", expected: "First\n\nSecond"},
    {name: "literal markup", text: "<div>First</div>\n  Second", expected: "<div>First</div>\n  Second"},
    {name: "edge newlines", text: "\nFirst\n", expected: "\nFirst\n"},
  ])("preserves $name when pasting over a selection and restoring the draft", ({text, expected}) => {
    const schema = getSchema([Document, Paragraph, Text, HardBreak]);
    const doc = schema.nodeFromJSON(contentPartsToEditorContent([{type: "text", text: "before replace after"}]));
    const state = EditorState.create({doc, selection: TextSelection.create(doc, 8, 15)});
    const slice = parseComposerClipboardText(text, state.selection.$from);
    const pasted = state.apply(state.tr.replaceSelection(slice));
    const parts = editorToContentParts({state: pasted} as Editor);

    expect(parts).toEqual([{type: "text", text: `before ${expected} after`}]);
    const restored = schema.nodeFromJSON(contentPartsToEditorContent(parts));
    expect(editorToContentParts({state: {doc: restored}} as Editor)).toEqual(parts);
  });

  it("builds prompt text from structured content parts", () => {
    expect(
      textFromComposerContentParts([
        {text: "read ", type: "text"},
        {id: "part-1", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
      ])
    ).toBe("read @src/file.ts");
  });

  it("trims text around selected reference parts", () => {
    const parts = trimComposerContentParts([
      {text: "  read ", type: "text"},
      {id: "part-1", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
      {text: "  ", type: "text"},
    ]);

    expect(parts).toEqual([
      {text: "read ", type: "text"},
      {id: "part-1", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
    ]);
  });

  it("drops empty text parts after trimming", () => {
    expect(trimComposerContentParts([{text: "  ", type: "text"}])).toEqual([]);
  });

  it("creates a tiptap reference node from a reference content part", () => {
    expect(
      createReferenceNode({
        id: "part-1",
        kind: "file",
        name: "file.ts",
        type: "reference",
        value: "@src/file.ts",
      })
    ).toEqual({
      attrs: {
        id: "part-1",
        kind: "file",
        name: "file.ts",
        value: "@src/file.ts",
      },
      type: "composerReference",
    });
  });

  it("converts editor text, hard breaks, and references into content parts", () => {
    const editor = mockEditor([
      {text: "read", type: {name: "text"}},
      {text: " ", type: {name: "text"}},
      {
        attrs: {id: "part-1", kind: "file", name: "file.ts", value: "@src/file.ts"},
        type: {name: "composerReference"},
      },
      {type: {name: "hardBreak"}},
      {text: "please", type: {name: "text"}},
    ]);

    expect(editorToContentParts(editor)).toEqual([
      {text: "read ", type: "text"},
      {id: "part-1", kind: "file", name: "file.ts", type: "reference", value: "@src/file.ts"},
      {text: "\nplease", type: "text"},
    ]);
  });
});
