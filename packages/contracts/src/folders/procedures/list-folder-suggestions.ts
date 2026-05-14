import {Schema} from "effect";
import {FolderQueryPathType, FolderSuggestion} from "../schemas";

export const FolderSuggestionsListPayload = Schema.Struct({
  query: Schema.String,
});

export const FolderSuggestionsListResult = Schema.Struct({
  homePath: Schema.String,
  query: Schema.String,
  queryPath: Schema.String,
  queryPathType: FolderQueryPathType,
  suggestions: Schema.Array(FolderSuggestion),
});

export class FolderSuggestionsListError extends Schema.TaggedErrorClass<FolderSuggestionsListError>()("FolderSuggestionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type FolderSuggestionsListPayload = typeof FolderSuggestionsListPayload.Type;
export type FolderSuggestionsListResult = typeof FolderSuggestionsListResult.Type;
