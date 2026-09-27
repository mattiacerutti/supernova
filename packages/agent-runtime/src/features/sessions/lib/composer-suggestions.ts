import {basename} from "node:path";
import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import type {ComposerSuggestionItem} from "@supernova/contracts/sessions/procedures";
import {generateStableId} from "@supernova/agent-runtime/lib/id-generator";

function titleCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

/** Skills and prompt templates as composer suggestion items. */
export function toComposerSuggestions(skills: readonly Skill[], templates: readonly PromptTemplate[]): ComposerSuggestionItem[] {
  return [
    ...skills.map((skill) => ({
      id: generateStableId("skl", [skill.name, skill.filePath]),
      kind: "skill" as const,
      name: skill.name,
      subtitle: skill.description,
      title: titleCase(skill.name),
    })),
    ...templates.map((template) => ({
      id: generateStableId("pmt", [template.name, template.filePath]),
      kind: "prompt-template" as const,
      prompt: template.content,
      subtitle: template.description,
      title: template.name || basename(template.filePath, ".md"),
    })),
  ];
}
