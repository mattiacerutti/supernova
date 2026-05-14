import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  FolderCreateError,
  FolderCreatePayload,
  FolderCreateResult,
  FolderSuggestionsListError,
  FolderSuggestionsListPayload,
  FolderSuggestionsListResult,
} from "@pi-desktop/contracts/folders/procedures";

export const FolderCreateRpc = Rpc.make("createFolder", {
  error: FolderCreateError,
  payload: FolderCreatePayload,
  success: FolderCreateResult,
});

export const FolderSuggestionsListRpc = Rpc.make("listFolderSuggestions", {
  error: FolderSuggestionsListError,
  payload: FolderSuggestionsListPayload,
  success: FolderSuggestionsListResult,
});

export const FolderRpcs = [FolderCreateRpc, FolderSuggestionsListRpc] as const;
