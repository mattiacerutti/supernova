import type {Editor} from "@tiptap/react";
import {describe, expect, it} from "vitest";
import {createReferenceNode, editorToContentParts, textFromComposerContentParts, trimComposerContentParts} from "@/features/sessions/lib/composer/composer-content-parts";

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
  it("builds prompt text from structured content parts", () => {
    expect(
      textFromComposerContentParts([
        {text: "read ", type: "text"},
        {id: "part-1", kind: "file", title: "file.ts", type: "reference", value: "@src/file.ts"},
      ])
    ).toBe("read @src/file.ts");
  });

  it("trims text around selected reference parts", () => {
    const parts = trimComposerContentParts([
      {text: "  read ", type: "text"},
      {id: "part-1", kind: "file", title: "file.ts", type: "reference", value: "@src/file.ts"},
      {text: "  ", type: "text"},
    ]);

    expect(parts).toEqual([
      {text: "read ", type: "text"},
      {id: "part-1", kind: "file", title: "file.ts", type: "reference", value: "@src/file.ts"},
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
        subtitle: "src",
        title: "file.ts",
        type: "reference",
        value: "@src/file.ts",
      })
    ).toEqual({
      attrs: {
        id: "part-1",
        kind: "file",
        subtitle: "src",
        title: "file.ts",
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
        attrs: {id: "part-1", kind: "file", subtitle: "src", title: "file.ts", value: "@src/file.ts"},
        type: {name: "composerReference"},
      },
      {type: {name: "hardBreak"}},
      {text: "please", type: {name: "text"}},
    ]);

    expect(editorToContentParts(editor)).toEqual([
      {text: "read ", type: "text"},
      {id: "part-1", kind: "file", subtitle: "src", title: "file.ts", type: "reference", value: "@src/file.ts"},
      {text: "\nplease", type: "text"},
    ]);
  });
});
