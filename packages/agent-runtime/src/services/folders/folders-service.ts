import {Context, Effect} from "effect";
import type {FolderCreateError, FolderSuggestionsListError, FolderCreateResult, FolderSuggestionsListResult} from "@pi-desktop/contracts/folders/procedures";

export interface FoldersServiceShape {
  readonly create: (path: string) => Effect.Effect<FolderCreateResult, FolderCreateError>;
  readonly listSuggestions: (query: string) => Effect.Effect<FolderSuggestionsListResult, FolderSuggestionsListError>;
}

export class FoldersService extends Context.Service<FoldersService, FoldersServiceShape>()("pi-desktop/agent-runtime/FoldersService") {}
