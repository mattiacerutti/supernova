import {queryOptions, useQuery} from "@tanstack/react-query";
import type {ComposerSuggestionItem, ComposerSuggestionMatch} from "@/features/sessions/types/composer-suggestion";
import {clientSlashCommandSuggestions} from "@/features/sessions/lib/composer/editor/client-slash-commands";
import {filterComposerSuggestions} from "@/features/sessions/lib/composer/editor/composer-suggestions";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/editor/client-slash-commands";
import {sessionKeys} from "@/features/sessions/api/query-keys";
import {unwrap} from "@/rpc/runtime-result";
import {useRuntime} from "@/rpc/use-runtime";

/** Loads project resources on composer mount; only file searches make requests while typing. */
export function useComposerSuggestions(projectPath: string, match: ComposerSuggestionMatch | null, input: {readonly slashCommandActions?: ClientSlashCommandActions} = {}) {
  const runtime = useRuntime();
  const resources = useQuery({
    ...queryOptions({
      queryKey: sessionKeys.composerResources(projectPath),
      enabled: !!projectPath,
      staleTime: Infinity,
      gcTime: Infinity,
      queryFn: () => unwrap(runtime.composer.listSuggestions({projectPath})),
    }),
    select: (result): ComposerSuggestionItem[] => {
      if (!match || match.kind === "file") return [];
      const items = filterComposerSuggestions(result.items, match.kind, match.query);
      return match.kind === "slash" ? [...clientSlashCommandSuggestions({actions: input.slashCommandActions ?? {}, query: match.query}), ...items] : items;
    },
  });
  const files = useQuery({
    ...queryOptions({
      queryKey: sessionKeys.composerFiles(projectPath, match?.kind === "file" ? match.query : null),
      enabled: match?.kind === "file",
      placeholderData: (previousData, previousQuery) => (previousQuery?.queryKey[2] === projectPath ? previousData : undefined),
      queryFn: () => unwrap(runtime.folders.listFiles({projectPath, query: match?.query ?? ""})),
    }),
    select: (result): ComposerSuggestionItem[] => result.items.map((item) => ({id: item.path, kind: "file", path: item.path, subtitle: item.subtitle, title: item.title})),
  });
  return match?.kind === "file" ? files : resources;
}
