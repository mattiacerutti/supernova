import type {SuggestionOptions} from "@tiptap/suggestion";
import {describe, expect, it} from "vitest";
import {findComposerSuggestionMatch} from "@/features/sessions/lib/composer/composer-suggestions";

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
