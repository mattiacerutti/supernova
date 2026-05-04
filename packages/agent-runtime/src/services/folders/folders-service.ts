import {Context, Effect} from "effect";
import type {AgentFolderSuggestionsListError, IAgentFolderSuggestionsListResult} from "@pi-desktop/contracts/folders";

export interface IFoldersService {
  readonly listSuggestions: (query: string) => Effect.Effect<IAgentFolderSuggestionsListResult, AgentFolderSuggestionsListError>;
}

export class FoldersService extends Context.Service<FoldersService, IFoldersService>()("pi-desktop/agent-runtime/FoldersService") {}
