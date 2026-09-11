import {basename} from "node:path";
import {Effect} from "effect";
import {ListComposerSuggestionsError} from "@supernova/contracts/sessions/procedures";
import type {ComposerSuggestionItem} from "@supernova/contracts/sessions/procedures";
import {PiResourceCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import {generateStableId} from "@supernova/agent-runtime/layers/shared/lib/id-generator";

/** Returns the complete project resource list for client-side composer filtering. */
export function listComposerSuggestions(projectPath: string) {
  return Effect.gen(function* () {
    const resourceCatalog = yield* PiResourceCatalog;

    return yield* Effect.tryPromise({
      try: async () => {
        const [skills, templates] = await Promise.all([resourceCatalog.listSkills(projectPath), resourceCatalog.listPromptTemplates(projectPath)]);
        const items: ComposerSuggestionItem[] = [
          ...skills.map((skill) => ({
            id: generateStableId("skl", [skill.name, skill.filePath]),
            kind: "skill" as const,
            name: skill.name,
            subtitle: skill.description,
            title: skill.name
              .split("-")
              .filter(Boolean)
              .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
              .join(" "),
          })),
          ...templates.map((template) => ({
            id: generateStableId("pmt", [template.name, template.filePath]),
            kind: "prompt-template" as const,
            prompt: template.content,
            subtitle: template.description,
            title: template.name || basename(template.filePath, ".md"),
          })),
        ];
        return {items};
      },
      catch: (cause) => new ListComposerSuggestionsError({cause, message: cause instanceof Error ? cause.message : "Failed to list composer suggestions."}),
    });
  });
}
