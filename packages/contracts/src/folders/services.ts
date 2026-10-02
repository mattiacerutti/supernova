import type {Context} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {
  FolderCreatePayload,
  FolderCreateResult,
  FolderFilesListPayload,
  FolderFilesListResult,
  FolderSuggestionsListPayload,
  FolderSuggestionsListResult,
} from "@supernova/contracts/folders/procedures";
import type {ServiceResult} from "@supernova/contracts/runtime/services";

/** Folders on the server's machine: browsing for projects and mentioning files. */
export interface FoldersService {
  create(payload: FolderCreatePayload, context: Context): Promise<ServiceResult<FolderCreateResult>>;
  listSuggestions(payload: FolderSuggestionsListPayload, context: Context): Promise<ServiceResult<FolderSuggestionsListResult>>;
  listFiles(payload: FolderFilesListPayload, context: Context): Promise<ServiceResult<FolderFilesListResult>>;
}

export const FoldersService = defineService<FoldersService>("supernova.folders");
