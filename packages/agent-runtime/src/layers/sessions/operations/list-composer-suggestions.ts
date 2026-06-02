import {basename} from "node:path";
import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import {Effect} from "effect";
import {matchSorter} from "match-sorter";
import {ListComposerSuggestionsError} from "@supernova/contracts/sessions/procedures";
import type {ComposerSuggestionItem, ComposerSuggestionTriggerKind} from "@supernova/contracts/sessions/procedures";
import {PiResourceCatalog} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import type {PiResourceCatalogShape} from "@supernova/agent-runtime/layers/shared/internal/pi-resource-catalog";
import {generateStableId} from "@supernova/agent-runtime/layers/shared/lib/id-generator";

const MAX_SUGGESTIONS = 50;

function skillTitle(name: string): string {
  return name
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function promptTitle(template: PromptTemplate): string {
  return template.name || basename(template.filePath, ".md");
}

/** Ranks composer suggestion candidates against the user query. */
function rankItems<T>(items: readonly T[], query: string, keys: readonly ((item: T) => string)[]): T[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [...items].slice(0, MAX_SUGGESTIONS);

  return matchSorter(items, normalizedQuery, {keys}).slice(0, MAX_SUGGESTIONS);
}

function skillSuggestion(skill: Skill): ComposerSuggestionItem {
  return {
    id: generateStableId("skl", [skill.name, skill.filePath]),
    kind: "skill",
    name: skill.name,
    subtitle: skill.description,
    title: skillTitle(skill.name),
  };
}

function promptSuggestion(template: PromptTemplate): ComposerSuggestionItem {
  return {
    id: generateStableId("pmt", [template.name, template.filePath]),
    kind: "prompt-template",
    prompt: template.content,
    subtitle: template.description,
    title: promptTitle(template),
  };
}

/** Loads Pi resources and returns ranked composer suggestions for the trigger kind. */
async function listPiComposerSuggestions(
  resourceCatalog: PiResourceCatalogShape,
  projectPath: string,
  kind: ComposerSuggestionTriggerKind,
  query: string
): Promise<ComposerSuggestionItem[]> {
  if (kind === "skill") {
    const skills = await resourceCatalog.listSkills(projectPath);
    return rankItems(skills, query, [(skill) => skill.name, (skill) => skill.description]).map(skillSuggestion);
  }

  const promptTemplates = await resourceCatalog.listPromptTemplates(projectPath);
  return rankItems(promptTemplates, query, [(template) => template.name, (template) => template.description, (template) => template.content]).map(promptSuggestion);
}

/** Lists skills or prompt templates for composer autocompletion. */
export function listComposerSuggestions(projectPath: string, kind: ComposerSuggestionTriggerKind, query: string) {
  return Effect.gen(function* () {
    const resourceCatalog = yield* PiResourceCatalog;

    return yield* Effect.tryPromise({
      try: async () => ({
        items: await listPiComposerSuggestions(resourceCatalog, projectPath, kind, query),
        query,
      }),
      catch: (cause) =>
        new ListComposerSuggestionsError({
          cause,
          message: cause instanceof Error ? cause.message : "Failed to list composer suggestions.",
        }),
    });
  });
}
