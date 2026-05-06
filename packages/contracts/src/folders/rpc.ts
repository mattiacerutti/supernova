import * as Rpc from "effect/unstable/rpc/Rpc";
import {Schema} from "effect";
import {AgentFolderSuggestionsListError, AgentFolderSuggestionsListResult} from "@pi-desktop/contracts/folders";

export const AgentFolderSuggestionsListRpc = Rpc.make("listFolderSuggestions", {
  error: AgentFolderSuggestionsListError,
  payload: Schema.Struct({
    query: Schema.String,
  }),
  success: AgentFolderSuggestionsListResult,
});

export const AgentFolderRpcs = [AgentFolderSuggestionsListRpc] as const;
