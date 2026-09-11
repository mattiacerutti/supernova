import type {Skill} from "@earendil-works/pi-coding-agent";
import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {listComposerSuggestions} from "@supernova/agent-runtime/layers/sessions/operations/list-composer-suggestions";
import {PiResourceCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";

function run(catalog: PiResourceCatalogShape) {
  return Effect.runPromise(listComposerSuggestions("/workspace").pipe(Effect.provideService(PiResourceCatalog, catalog)));
}

describe("listing composer suggestions", () => {
  it("returns every resource without filtering or truncating the client snapshot", async () => {
    const result = await run({
      listPromptTemplates: async () => [
        {
          name: "",
          filePath: "/prompts/summary.md",
          description: "Overview",
          content: "Summarize changes",
          sourceInfo: {origin: "top-level", path: "/prompts/summary.md", scope: "project", source: "test"},
        },
      ],
      listSkills: async () => Array.from({length: 55}, (_, index) => ({name: `skill-${index}`, description: `Skill ${index}`, filePath: `/skills/${index}/SKILL.md`}) as Skill),
      readSkillContent: async () => "",
    });
    expect(result.items).toHaveLength(56);
    expect(result.items[54]).toMatchObject({kind: "skill", name: "skill-54", title: "Skill 54"});
    expect(result.items[55]).toMatchObject({kind: "prompt-template", title: "summary", prompt: "Summarize changes"});
  });

  it("maps discovery failures to the RPC error", async () => {
    await expect(
      run({
        listPromptTemplates: async () => [],
        listSkills: async () => {
          throw new Error("resources unavailable");
        },
        readSkillContent: async () => "",
      })
    ).rejects.toMatchObject({_tag: "ListComposerSuggestionsError", message: "resources unavailable"});
  });
});
