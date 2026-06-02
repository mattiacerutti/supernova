import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import {Effect, Layer} from "effect";
import {describe, expect, it} from "vitest";
import {ListComposerSuggestionsError} from "@supernova/contracts/sessions/procedures";
import {listComposerSuggestions} from "@supernova/agent-runtime/layers/sessions/operations/list-composer-suggestions";
import {PiResourceCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";

function skill(input: {description: string; name: string}): Skill {
  return {
    baseDir: `/workspace/.agents/skills/${input.name}`,
    description: input.description,
    disableModelInvocation: false,
    filePath: `/workspace/.agents/skills/${input.name}/SKILL.md`,
    name: input.name,
  } as Skill;
}

function promptTemplate(input: {content: string; description: string; filePath?: string; name: string}): PromptTemplate {
  return {
    content: input.content,
    description: input.description,
    filePath: input.filePath ?? `/workspace/.pi/prompts/${input.name}.md`,
    name: input.name,
  } as PromptTemplate;
}

function runWithCatalog<A, E>(catalog: PiResourceCatalogShape, effect: Effect.Effect<A, E, PiResourceCatalog>) {
  return Effect.runPromise(effect.pipe(Effect.provide(Layer.succeed(PiResourceCatalog, catalog))));
}

describe("listing composer suggestions", () => {
  it("ranks skills by user query and formats titles for display", async () => {
    const catalog: PiResourceCatalogShape = {
      listPromptTemplates: async () => [],
      listSkills: async () => [skill({description: "Reviews code for correctness", name: "code-review"}), skill({description: "Plans release notes", name: "release-notes"})],
      readSkillContent: async () => "",
    };

    const result = await runWithCatalog(catalog, listComposerSuggestions("/workspace", "skill", "review"));

    expect(result).toMatchObject({
      items: [
        {
          kind: "skill",
          name: "code-review",
          subtitle: "Reviews code for correctness",
          title: "Code Review",
        },
      ],
      query: "review",
    });
  });

  it("ranks prompt templates by name, description, and content", async () => {
    const catalog: PiResourceCatalogShape = {
      listPromptTemplates: async () => [
        promptTemplate({content: "Write a concise project summary", description: "Project overview", name: "summary"}),
        promptTemplate({content: "Generate failing edge-case tests", description: "QA helper", name: "quality"}),
      ],
      listSkills: async () => [],
      readSkillContent: async () => "",
    };

    const result = await runWithCatalog(catalog, listComposerSuggestions("/workspace", "slash", "edge-case"));

    expect(result).toMatchObject({
      items: [
        {
          kind: "prompt-template",
          prompt: "Generate failing edge-case tests",
          subtitle: "QA helper",
          title: "quality",
        },
      ],
      query: "edge-case",
    });
  });

  it("caps empty-query suggestions at the display limit", async () => {
    const catalog: PiResourceCatalogShape = {
      listPromptTemplates: async () => [],
      listSkills: async () => Array.from({length: 55}, (_, index) => skill({description: `Skill ${index}`, name: `skill-${index}`})),
      readSkillContent: async () => "",
    };

    const result = await runWithCatalog(catalog, listComposerSuggestions("/workspace", "skill", "   "));

    expect(result.items).toHaveLength(50);
    expect(result.items.at(0)).toMatchObject({name: "skill-0", title: "Skill 0"});
    expect(result.items.at(-1)).toMatchObject({name: "skill-49", title: "Skill 49"});
  });

  it("maps catalog failures to a composer suggestions error", async () => {
    const catalog: PiResourceCatalogShape = {
      listPromptTemplates: async () => [],
      listSkills: async () => {
        throw new Error("resources unavailable");
      },
      readSkillContent: async () => "",
    };

    await expect(runWithCatalog(catalog, listComposerSuggestions("/workspace", "skill", "review"))).rejects.toMatchObject({
      _tag: "ListComposerSuggestionsError",
      message: "resources unavailable",
    } satisfies Partial<ListComposerSuggestionsError>);
  });
});
