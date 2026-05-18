import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  FolderCreateError,
  FolderCreatePayload,
  FolderCreateResult,
  FolderFilesListError,
  FolderFilesListPayload,
  FolderFilesListResult,
  FolderSuggestionsListError,
  FolderSuggestionsListPayload,
  FolderSuggestionsListResult,
} from "@supernova/contracts/folders/procedures";

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

export const FolderFilesListRpc = Rpc.make("listFolderFiles", {
  error: FolderFilesListError,
  payload: FolderFilesListPayload,
  success: FolderFilesListResult,
});

export const FolderRpcs = [FolderCreateRpc, FolderSuggestionsListRpc, FolderFilesListRpc] as const;
