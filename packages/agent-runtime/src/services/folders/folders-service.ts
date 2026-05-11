import {Context, Effect} from "effect";
import type {AgentFolderCreateError, AgentFolderSuggestionsListError, IAgentFolderCreateResult, IAgentFolderSuggestionsListResult} from "@pi-desktop/contracts/folders";

export interface IFoldersService {
  readonly create: (path: string) => Effect.Effect<IAgentFolderCreateResult, AgentFolderCreateError>;
  readonly listSuggestions: (query: string) => Effect.Effect<IAgentFolderSuggestionsListResult, AgentFolderSuggestionsListError>;
}

export class FoldersService extends Context.Service<FoldersService, IFoldersService>()("pi-desktop/agent-runtime/FoldersService") {}
