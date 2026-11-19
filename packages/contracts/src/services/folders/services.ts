import type {Reference} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {FolderCreateResult, FolderFilesListResult, FolderSuggestionsListResult} from "@supernova/contracts/services/folders/procedures";
import {FolderCreatePayload, FolderFilesListPayload, FolderSuggestionsListPayload} from "@supernova/contracts/services/folders/procedures";
import {json, serverHost} from "@supernova/contracts/lib/protocol";

export const FoldersService = remote("supernova.folders", {
  version: 3,
  params: {},
  hostAddress: serverHost,
  variants: {
    owner: {
      methods: {
        create: method(FolderCreatePayload, json<FolderCreateResult>()),
        listSuggestions: method(FolderSuggestionsListPayload, json<FolderSuggestionsListResult>()),
        listFiles: method(FolderFilesListPayload, json<FolderFilesListResult>()),
      },
    },
  },
});

export type FoldersService = Reference<typeof FoldersService>;
