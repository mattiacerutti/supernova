import type {FolderFile} from "@pi-desktop/contracts/folders/schemas";
import {useQuery} from "@tanstack/react-query";
import type {
  ComposerFileReferenceSuggestionItem,
  ComposerPromptTemplateSuggestionItem,
  ComposerSkillSuggestionItem,
  ComposerSlashCommandSuggestionItem,
  ComposerSuggestionItem,
  ComposerSuggestionMatch,
  ComposerSuggestionTriggerKind,
} from "@/features/sessions/types/composer-suggestion";

const MOCK_FOLDER_FILES: readonly FolderFile[] = [
  {
    path: "@packages/web/src/features/sessions/components/composer/session-composer.tsx",
    subtitle: "packages/web/src/features/sessions/components/composer",
    title: "session-composer.tsx",
  },
  {
    path: "@packages/web/src/features/sessions/components/composer/session-composer-editor.tsx",
    subtitle: "packages/web/src/features/sessions/components/composer",
    title: "session-composer-editor.tsx",
  },
  {
    path: "@packages/contracts/src/folders/procedures/list-folder-files.ts",
    subtitle: "packages/contracts/src/folders/procedures",
    title: "list-folder-files.ts",
  },
  {
    path: "@packages/web/src/features/sessions/lib/composer/composer-content-parts.ts",
    subtitle: "packages/web/src/features/sessions/lib/composer",
    title: "composer-content-parts.ts",
  },
];

const MOCK_FILE_SUGGESTIONS: readonly ComposerFileReferenceSuggestionItem[] = MOCK_FOLDER_FILES.map((item) => ({
  id: item.path,
  kind: "file",
  path: item.path,
  subtitle: item.subtitle,
  title: item.title,
}));
const MOCK_PROMPT_TEMPLATE_SUGGESTIONS: readonly ComposerPromptTemplateSuggestionItem[] = [
  {
    id: "prompt-review-changes",
    kind: "prompt-template",
    prompt: "Review the current changes for bugs, regressions, and missing tests.",
    subtitle: "Code review",
    title: "Review current changes",
  },
  {
    id: "prompt-write-tests",
    kind: "prompt-template",
    prompt: "Add focused tests for this behavior and run the relevant verification commands.",
    subtitle: "Testing",
    title: "Write tests",
  },
  {
    id: "prompt-explain-error",
    kind: "prompt-template",
    prompt: "Explain the root cause of this error and suggest the smallest safe fix.",
    subtitle: "Debugging",
    title: "Explain an error",
  },
];
const MOCK_SKILL_SUGGESTIONS: readonly ComposerSkillSuggestionItem[] = [
  {
    id: "skill-effect-ts",
    kind: "skill",
    name: "effect-ts",
    subtitle: "Effect services, layers, errors, and composition",
    title: "Effect TS",
  },
  {
    id: "skill-no-use-effect",
    kind: "skill",
    name: "no-use-effect",
    subtitle: "React patterns that avoid useEffect",
    title: "No useEffect",
  },
  {
    id: "skill-find-skills",
    kind: "skill",
    name: "find-skills",
    subtitle: "Discover and install agent skills",
    title: "Find skills",
  },
];
const CLIENT_SLASH_COMMAND_SUGGESTIONS: readonly ComposerSlashCommandSuggestionItem[] = [
  {
    id: "slash-clear",
    kind: "slash-command",
    onSelect: () => undefined,
    subtitle: "Clear the composer draft",
    title: "Clear draft",
  },
  {
    id: "slash-plan",
    kind: "slash-command",
    onSelect: () => undefined,
    subtitle: "Ask the agent to outline an implementation plan",
    title: "Plan",
  },
  {
    id: "slash-tests",
    kind: "slash-command",
    onSelect: () => undefined,
    subtitle: "Ask the agent to run verification",
    title: "Run tests",
  },
];

function searchableText(item: ComposerSuggestionItem): readonly (string | undefined)[] {
  switch (item.kind) {
    case "file":
      return [item.title, item.subtitle, item.path];
    case "prompt-template":
      return [item.title, item.subtitle, item.prompt];
    case "skill":
      return [item.title, item.subtitle, item.name];
    case "slash-command":
      return [item.title, item.subtitle];
  }
}

function matchesQuery(item: ComposerSuggestionItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return searchableText(item).some((value) => value?.toLowerCase().includes(normalizedQuery));
}

async function fetchComposerSuggestions(input: {kind: ComposerSuggestionTriggerKind; query: string}): Promise<readonly ComposerSuggestionItem[]> {
  switch (input.kind) {
    case "file":
      return MOCK_FILE_SUGGESTIONS.filter((item) => matchesQuery(item, input.query));
    case "skill":
      return MOCK_SKILL_SUGGESTIONS.filter((item) => matchesQuery(item, input.query));
    case "slash":
      return [...CLIENT_SLASH_COMMAND_SUGGESTIONS, ...MOCK_PROMPT_TEMPLATE_SUGGESTIONS].filter((item) => matchesQuery(item, input.query));
  }
}

export function useComposerSuggestions(match: ComposerSuggestionMatch | null) {
  return useQuery({
    enabled: !!match,
    placeholderData: (previousData) => previousData,
    queryKey: ["composer", "suggestions", match?.kind, match?.query] as const,
    queryFn: () => {
      if (!match) {
        throw new Error("Match is required");
      }

      return fetchComposerSuggestions({
        kind: match.kind,
        query: match.query,
      });
    },
  });
}
