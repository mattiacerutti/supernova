import {Context, Effect} from "effect";
import type {
  FolderCreateError,
  FolderCreateResult,
  FolderFilesListError,
  FolderFilesListResult,
  FolderSuggestionsListError,
  FolderSuggestionsListResult,
} from "@supernova/contracts/folders/procedures";

export interface FoldersServiceShape {
  readonly create: (path: string) => Effect.Effect<FolderCreateResult, FolderCreateError>;
  readonly listFiles: (projectPath: string, query: string) => Effect.Effect<FolderFilesListResult, FolderFilesListError>;
  readonly listSuggestions: (query: string) => Effect.Effect<FolderSuggestionsListResult, FolderSuggestionsListError>;
}

export class FoldersService extends Context.Service<FoldersService, FoldersServiceShape>()("supernova/agent-runtime/FoldersService") {}
