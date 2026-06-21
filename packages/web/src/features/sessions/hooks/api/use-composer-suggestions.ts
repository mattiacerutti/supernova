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

export function allComposerSuggestionsQueryKey(projectPath: string) {
  return ["composer", "suggestions", projectPath] as const;
}

export function composerSuggestionsMatchQueryKey(projectPath: string, match: ComposerSuggestionMatch | null) {
  return [...allComposerSuggestionsQueryKey(projectPath), match?.kind] as const;
}

export function composerSuggestionsQueryKey(projectPath: string, match: ComposerSuggestionMatch | null) {
  return [...composerSuggestionsMatchQueryKey(projectPath, match), match?.query] as const;
}

export function useComposerSuggestions(projectPath: string, match: ComposerSuggestionMatch | null, input: {readonly slashCommandActions?: ClientSlashCommandActions} = {}) {
  const baseQueryKey = composerSuggestionsMatchQueryKey(projectPath, match);

  return useQuery(
    eq.queryOptions({
      enabled: !!match,
      placeholderData: (previousData, previousQuery) => {
        if (!previousQuery || !baseQueryKey.every((value, index) => value === previousQuery.queryKey[index])) return undefined;
        return previousData;
      },
      queryKey: composerSuggestionsQueryKey(projectPath, match),
      queryFn: () => {
        if (!match) return Effect.die(new Error("Match is required")) as Effect.Effect<ComposerSuggestionItem[]>;

        return Effect.flatMap(Effect.service(AgentRpcProtocolClientService), (rpc): Effect.Effect<ComposerSuggestionItem[], {_tag: string}, never> => {
          if (match.kind === "file") {
            return rpc.listFolderFiles({projectPath, query: match.query}).pipe(
              Effect.map((result) => {
                const suggestions: ComposerSuggestionItem[] = result.items.map(fileSuggestion);
                return suggestions;
              })
            );
          }

          return rpc.listComposerSuggestions({kind: match.kind, projectPath, query: match.query}).pipe(
            Effect.map((result) => {
              const suggestions: ComposerSuggestionItem[] = result.items.map(resourceSuggestion);

              if (match.kind === "slash") {
                return [...clientSlashCommandSuggestions({actions: input.slashCommandActions ?? {}, query: match.query}), ...suggestions];
              }

              return suggestions;
            })
          );
        });
      },
    })
  );
}
