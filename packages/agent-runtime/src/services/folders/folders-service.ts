import {Context, Effect} from "effect";
import type {AgentFolderCreateError, AgentFolderSuggestionsListError, AgentFolderCreateResult, AgentFolderSuggestionsListResult} from "@pi-desktop/contracts/folders/procedures";

export interface FoldersServiceShape {
  readonly create: (path: string) => Effect.Effect<AgentFolderCreateResult, AgentFolderCreateError>;
  readonly listSuggestions: (query: string) => Effect.Effect<AgentFolderSuggestionsListResult, AgentFolderSuggestionsListError>;
}

export class FoldersService extends Context.Service<FoldersService, FoldersServiceShape>()("pi-desktop/agent-runtime/FoldersService") {}
