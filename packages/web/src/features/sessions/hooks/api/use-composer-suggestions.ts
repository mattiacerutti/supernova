import type {FolderFile} from "@supernova/contracts/folders/schemas";
import {useQuery} from "@tanstack/react-query";
import type {ComposerSuggestionItem as ContractComposerSuggestionItem} from "@supernova/contracts/sessions/procedures";
import {Effect} from "effect";
import type {
  ComposerFileReferenceSuggestionItem,
  ComposerPromptTemplateSuggestionItem,
  ComposerSkillSuggestionItem,
  ComposerSuggestionItem,
  ComposerSuggestionMatch,
} from "@/features/sessions/types/composer-suggestion";
import {clientSlashCommandSuggestions} from "@/features/sessions/lib/composer/client-slash-commands";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/client-slash-commands";
import {eq} from "@/rpc/effect-query";
import {AgentRpcProtocolClientService} from "@/rpc/agent-rpc-client";

function fileSuggestion(item: FolderFile): ComposerFileReferenceSuggestionItem {
  return {
    id: item.path,
    kind: "file",
    path: item.path,
    subtitle: item.subtitle,
    title: item.title,
  };
}

function resourceSuggestion(item: ContractComposerSuggestionItem): ComposerPromptTemplateSuggestionItem | ComposerSkillSuggestionItem {
  return item;
}

export function useComposerSuggestions(projectPath: string, match: ComposerSuggestionMatch | null, input: {readonly slashCommandActions?: ClientSlashCommandActions} = {}) {
  const baseQueryKey = ["composer", "suggestions", projectPath, match?.kind] as const;

  return useQuery(
    eq.queryOptions({
      enabled: !!match,
      placeholderData: (previousData, previousQuery) => {
        if (!previousQuery || !baseQueryKey.every((value, index) => value === previousQuery.queryKey[index])) return undefined;
        return previousData;
      },
      queryKey: [...baseQueryKey, match?.query],
      queryFn: () =>
        Effect.gen(function* () {
          if (!match) {
            throw new Error("Match is required");
          }

          const rpc = yield* AgentRpcProtocolClientService;

          if (match.kind === "file") {
            const result = yield* rpc.listFolderFiles({projectPath, query: match.query});
            return result.items.map(fileSuggestion) satisfies ComposerSuggestionItem[];
          }

          const result = yield* rpc.listComposerSuggestions({kind: match.kind, projectPath, query: match.query});
          const suggestions = result.items.map(resourceSuggestion);

          if (match.kind === "slash") {
            return [...clientSlashCommandSuggestions({actions: input.slashCommandActions ?? {}, query: match.query}), ...suggestions] satisfies ComposerSuggestionItem[];
          }

          return suggestions satisfies ComposerSuggestionItem[];
        }),
    })
  );
}
