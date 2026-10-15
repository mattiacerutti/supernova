import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import type {
  FolderCreatePayload,
  FolderCreateResult,
  FolderFilesListPayload,
  FolderFilesListResult,
  FolderSuggestionsListPayload,
  FolderSuggestionsListResult,
} from "@supernova/contracts/services/folders/procedures";
import {json, result, SERVER_WIDE} from "@supernova/contracts/lib/protocol";

export const FoldersService = remote("supernova.folders", {
  version: 1,
  input: SERVER_WIDE,
  variants: {
    default: {
      methods: {
        create: method(json<FolderCreatePayload>(), result<FolderCreateResult>()),
        listSuggestions: method(json<FolderSuggestionsListPayload>(), result<FolderSuggestionsListResult>()),
        listFiles: method(json<FolderFilesListPayload>(), result<FolderFilesListResult>()),
      },
    },
  },
});

export type FoldersService = MembersOf<typeof FoldersService>;
