import {describe, expect, it} from "vitest";
import type {ComposerSuggestionItem} from "@supernova/contracts/services/sessions/procedures";
import {filterComposerSuggestions} from "@/features/sessions/lib/composer/editor/composer-suggestions";

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
