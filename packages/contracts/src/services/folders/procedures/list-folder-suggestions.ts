import {arr, obj, type Static, str} from "@earendil-works/chord";
import {FolderQueryPathType, FolderSuggestion} from "@supernova/contracts/services/folders/schemas";

export const FolderSuggestionsListPayload = obj({
  query: str(),
});

export const FolderSuggestionsListResult = obj({
  homePath: str(),
  query: str(),
  queryPath: str(),
  queryPathType: FolderQueryPathType,
  suggestions: arr(FolderSuggestion),
});

export type FolderSuggestionsListPayload = Static<typeof FolderSuggestionsListPayload>;
export type FolderSuggestionsListResult = Static<typeof FolderSuggestionsListResult>;
