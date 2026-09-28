import type {Skill} from "@earendil-works/pi-coding-agent";
import {describe, expect, it} from "vitest";
import {Sessions} from "@supernova/agent-runtime/features/sessions/sessions";
import type {SessionsDeps} from "@supernova/agent-runtime/features/sessions/sessions";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";

function run(resourceCache: ResourceCache) {
  return new Sessions({resourceCache, sdk: {} as SessionsDeps["sdk"]}).listComposerSuggestions({projectPath: "/workspace"});
}

describe("listing composer suggestions", () => {
  it("returns every resource without filtering or truncating the client snapshot", async () => {
    const result = await run({
      initialize: async () => undefined,
      invalidate: () => undefined,
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
});
