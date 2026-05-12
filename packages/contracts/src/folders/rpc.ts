import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  AgentFolderCreateError,
  AgentFolderCreatePayload,
  AgentFolderCreateResult,
  AgentFolderSuggestionsListError,
  AgentFolderSuggestionsListPayload,
  AgentFolderSuggestionsListResult,
} from "@pi-desktop/contracts/folders/procedures";

export const AgentFolderCreateRpc = Rpc.make("createFolder", {
  error: AgentFolderCreateError,
  payload: AgentFolderCreatePayload,
  success: AgentFolderCreateResult,
});

export const AgentFolderSuggestionsListRpc = Rpc.make("listFolderSuggestions", {
  error: AgentFolderSuggestionsListError,
  payload: AgentFolderSuggestionsListPayload,
  success: AgentFolderSuggestionsListResult,
});

export const AgentFolderRpcs = [AgentFolderCreateRpc, AgentFolderSuggestionsListRpc] as const;
