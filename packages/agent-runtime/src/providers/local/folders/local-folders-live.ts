import {Effect, Layer} from "effect";
import {homedir} from "node:os";
import {AgentFolderSuggestionsListError} from "@pi-desktop/contracts/folders";
import {FoldersService} from "@pi-desktop/agent-runtime/services/folders/folders-service";
import {listLocalFolderSuggestions} from "@pi-desktop/agent-runtime/providers/local/folders/local-folder-suggestions";

export const LocalFoldersLive = Layer.succeed(FoldersService, {
  listSuggestions: (query) =>
    Effect.tryPromise({
      try: async () => ({
        homePath: homedir(),
        query,
        suggestions: await listLocalFolderSuggestions(query),
      }),
      catch: (cause) =>
        new AgentFolderSuggestionsListError({
          cause,
          message: cause instanceof Error ? cause.message : "Failed to list folder suggestions.",
        }),
    }),
});
