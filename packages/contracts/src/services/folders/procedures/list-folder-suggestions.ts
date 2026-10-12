import {z} from "zod";
import {FolderQueryPathType, FolderSuggestion} from "../schemas";

export const FolderSuggestionsListPayload = z.object({
  query: z.string(),
});

export const FolderSuggestionsListResult = z.object({
  homePath: z.string(),
  query: z.string(),
  queryPath: z.string(),
  queryPathType: FolderQueryPathType,
  suggestions: z.array(FolderSuggestion),
});

export type FolderSuggestionsListPayload = z.infer<typeof FolderSuggestionsListPayload>;
export type FolderSuggestionsListResult = z.infer<typeof FolderSuggestionsListResult>;
