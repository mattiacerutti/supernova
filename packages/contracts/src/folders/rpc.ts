import * as Rpc from "effect/unstable/rpc/Rpc";
import {Schema} from "effect";
import {AgentFolderCreateError, AgentFolderCreateResult, AgentFolderSuggestionsListError, AgentFolderSuggestionsListResult} from "@pi-desktop/contracts/folders";

export const AgentFolderCreateRpc = Rpc.make("createFolder", {
  error: AgentFolderCreateError,
  payload: Schema.Struct({
    path: Schema.String,
  }),
  success: AgentFolderCreateResult,
});

export const AgentFolderSuggestionsListRpc = Rpc.make("listFolderSuggestions", {
  error: AgentFolderSuggestionsListError,
  payload: Schema.Struct({
    query: Schema.String,
  }),
  success: AgentFolderSuggestionsListResult,
});

export const AgentFolderRpcs = [AgentFolderCreateRpc, AgentFolderSuggestionsListRpc] as const;
