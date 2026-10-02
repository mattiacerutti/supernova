import {z} from "zod";
import {array, struct, TaggedError} from "@supernova/contracts/runtime/schemas";
import {FolderQueryPathType, FolderSuggestion} from "../schemas";

export const FolderSuggestionsListPayload = struct({
  query: z.string(),
});

export const FolderSuggestionsListResult = struct({
  homePath: z.string(),
  query: z.string(),
  queryPath: z.string(),
  queryPathType: FolderQueryPathType,
  suggestions: array(FolderSuggestion),
});

export class FolderSuggestionsListError extends TaggedError("FolderSuggestionsListError") {}

export type FolderSuggestionsListPayload = z.infer<typeof FolderSuggestionsListPayload>;
export type FolderSuggestionsListResult = z.infer<typeof FolderSuggestionsListResult>;
