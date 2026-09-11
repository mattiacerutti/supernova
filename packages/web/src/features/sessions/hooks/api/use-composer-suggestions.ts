import {useQuery} from "@tanstack/react-query";
import {Effect} from "effect";
import type {ComposerSuggestionItem, ComposerSuggestionMatch} from "@/features/sessions/types/composer-suggestion";
import {clientSlashCommandSuggestions} from "@/features/sessions/lib/composer/client-slash-commands";
import {filterComposerSuggestions} from "@/features/sessions/lib/composer/composer-suggestions";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/client-slash-commands";
import {eq} from "@/rpc/effect-query";
import {RpcProtocolClientService} from "@/rpc/transport/client";

/** Loads project resources on composer mount; only file searches make requests while typing. */
export function useComposerSuggestions(projectPath: string, match: ComposerSuggestionMatch | null, input: {readonly slashCommandActions?: ClientSlashCommandActions} = {}) {
  const resources = useQuery({
    ...eq.queryOptions({
      queryKey: ["composer", "resources", projectPath],
      enabled: !!projectPath,
      staleTime: Infinity,
      gcTime: Infinity,
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listComposerSuggestions({projectPath})),
    }),
    select: (result): ComposerSuggestionItem[] => {
      if (!match || match.kind === "file") return [];
      const items = filterComposerSuggestions(result.items, match.kind, match.query);
      return match.kind === "slash" ? [...clientSlashCommandSuggestions({actions: input.slashCommandActions ?? {}, query: match.query}), ...items] : items;
    },
  });
  const files = useQuery({
    ...eq.queryOptions({
      queryKey: ["composer", "files", projectPath, match?.kind === "file" ? match.query : null],
      enabled: match?.kind === "file",
      placeholderData: (previousData, previousQuery) => (previousQuery?.queryKey[2] === projectPath ? previousData : undefined),
      queryFn: () => Effect.flatMap(Effect.service(RpcProtocolClientService), (rpc) => rpc.listFolderFiles({projectPath, query: match?.query ?? ""})),
    }),
    select: (result): ComposerSuggestionItem[] => result.items.map((item) => ({id: item.path, kind: "file", path: item.path, subtitle: item.subtitle, title: item.title})),
  });
  return match?.kind === "file" ? files : resources;
}
