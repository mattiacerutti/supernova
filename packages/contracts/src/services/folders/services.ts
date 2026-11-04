import type {Reference} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {
  FolderCreatePayload,
  FolderCreateResult,
  FolderFilesListPayload,
  FolderFilesListResult,
  FolderSuggestionsListPayload,
  FolderSuggestionsListResult,
} from "@supernova/contracts/services/folders/procedures";
import {json, result, serverHost} from "@supernova/contracts/lib/protocol";

export const FoldersService = remote("supernova.folders", {
  version: 1,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      methods: {
        create: method(json<FolderCreatePayload>(), result<FolderCreateResult>()),
        listSuggestions: method(json<FolderSuggestionsListPayload>(), result<FolderSuggestionsListResult>()),
        listFiles: method(json<FolderFilesListPayload>(), result<FolderFilesListResult>()),
      },
    },
  },
});

export type FoldersService = Reference<typeof FoldersService>;
