import type {SuggestionOptions} from "@tiptap/suggestion";
import {describe, expect, it} from "vitest";
import type {ComposerSuggestionItem} from "@supernova/contracts/sessions/procedures";
import {filterComposerSuggestions, findComposerSuggestionMatch} from "@/features/sessions/lib/composer/composer-suggestions";

type SuggestionMatcherInput = Parameters<NonNullable<SuggestionOptions["findSuggestionMatch"]>>[0];

function matcherInput(text: string, cursor: number): SuggestionMatcherInput {
  return {
    $position: {
      parent: {
        content: {size: text.length},
        textBetween: () => text,
      },
      parentOffset: cursor,
      start: () => 1,
    },
  } as unknown as SuggestionMatcherInput;
}

describe("local resource filtering", () => {
  const items: ComposerSuggestionItem[] = [
    ...Array.from({length: 55}, (_, index) => ({id: `skill-${index}`, kind: "skill" as const, name: `skill-${index}`, title: `Skill ${index}`})),
    {id: "audit", kind: "skill", name: "audit", title: "Audit", subtitle: "Detect security vulnerabilities"},
    {id: "review", kind: "prompt-template", prompt: "Review changes", title: "review", subtitle: "Check correctness"},
    {id: "summary", kind: "prompt-template", title: "summary", prompt: "Generate edge-case tests"},
  ];
  it.each([
    {kind: "skill" as const, query: "   ", count: 50, first: "skill-0"},
    {kind: "skill" as const, query: "skill-54", count: 1, first: "skill-54"},
    {kind: "skill" as const, query: "vulnerabilities", count: 1, first: "audit"},
    {kind: "slash" as const, query: "CORRECTNESS", count: 1, first: "review"},
    {kind: "slash" as const, query: "edge-case", count: 1, first: "summary"},
    {kind: "slash" as const, query: "", count: 2, first: "review"},
  ])("filters $kind / $query after loading the complete snapshot", ({kind, query, count, first}) => {
    const result = filterComposerSuggestions(items, kind, query);
    expect(result).toHaveLength(count);
    expect(result[0]?.id).toBe(first);
  });
});

describe("composer suggestions matcher", () => {
  it("uses the full token query when the caret is inside a file reference", () => {
    const match = findComposerSuggestionMatch({char: "@", startOfLine: false})(matcherInput("read @feature-1", "read @".length));

    expect(match).toEqual({
      query: "feature-1",
      range: {from: 6, to: 16},
      text: "@feature-1",
    });
  });

  it("uses the full token query when the caret is at the end of a file reference", () => {
    const match = findComposerSuggestionMatch({char: "@", startOfLine: false})(matcherInput("read @feature-1", "read @feature-1".length));

    expect(match).toEqual({
      query: "feature-1",
      range: {from: 6, to: 16},
      text: "@feature-1",
    });
  });

  it("does not match file references without an allowed prefix", () => {
    const match = findComposerSuggestionMatch({char: "@", startOfLine: false})(matcherInput("email@domain", "email@".length));

    expect(match).toBeNull();
  });

  it("only matches slash commands at the start of the line", () => {
    const matcher = findComposerSuggestionMatch({char: "/", startOfLine: true});

    expect(matcher(matcherInput("/review", "/".length))).toEqual({
      query: "review",
      range: {from: 1, to: 8},
      text: "/review",
    });
    expect(matcher(matcherInput("please /review", "please /".length))).toBeNull();
  });
});
