import {basename} from "node:path";
import {DefaultResourceLoader, getAgentDir, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import {Effect} from "effect";
import {matchSorter} from "match-sorter";
import {SessionComposerSuggestionsListError} from "@pi-desktop/contracts/sessions/procedures";
import type {SessionComposerSuggestionItem, SessionComposerSuggestionTriggerKind} from "@pi-desktop/contracts/sessions/procedures";
import {generateStableId} from "@pi-desktop/agent-runtime/implementations/shared/id-generator";

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

function rankItems<T>(items: readonly T[], query: string, keys: readonly ((item: T) => string)[]): T[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [...items].slice(0, MAX_SUGGESTIONS);

  return matchSorter(items, normalizedQuery, {keys}).slice(0, MAX_SUGGESTIONS);
}

function skillSuggestion(skill: Skill): SessionComposerSuggestionItem {
  return {
    id: generateStableId("skl", [skill.name, skill.filePath]),
    kind: "skill",
    name: skill.name,
    subtitle: skill.description,
    title: skillTitle(skill.name),
  };
}

function promptSuggestion(template: PromptTemplate): SessionComposerSuggestionItem {
  return {
    id: generateStableId("pmt", [template.name, template.filePath]),
    kind: "prompt-template",
    prompt: template.content,
    subtitle: template.description,
    title: promptTitle(template),
  };
}

async function listPiComposerSuggestions(projectPath: string, kind: SessionComposerSuggestionTriggerKind, query: string): Promise<SessionComposerSuggestionItem[]> {
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({agentDir, cwd: projectPath, settingsManager: SettingsManager.create(projectPath, agentDir)});
  await resourceLoader.reload();

  if (kind === "skill") {
    return rankItems(resourceLoader.getSkills().skills, query, [(skill) => skill.name, (skill) => skill.description]).map(skillSuggestion);
  }

  const promptTemplates = resourceLoader.getPrompts().prompts;
  return rankItems(promptTemplates, query, [(template) => template.name, (template) => template.description, (template) => template.content]).map(promptSuggestion);
}

export function listComposerSuggestions(projectPath: string, kind: SessionComposerSuggestionTriggerKind, query: string) {
  return Effect.tryPromise({
    try: async () => ({
      items: await listPiComposerSuggestions(projectPath, kind, query),
      query,
    }),
    catch: (cause) =>
      new SessionComposerSuggestionsListError({
        cause,
        message: cause instanceof Error ? cause.message : "Failed to list composer suggestions.",
      }),
  });
}
