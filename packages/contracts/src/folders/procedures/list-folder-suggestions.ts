import {Schema} from "effect";
import {AgentFolderQueryPathType, AgentFolderSuggestion} from "../schemas";

export const AgentFolderSuggestionsListPayload = Schema.Struct({
  query: Schema.String,
});

export const AgentFolderSuggestionsListResult = Schema.Struct({
  homePath: Schema.String,
  query: Schema.String,
  queryPath: Schema.String,
  queryPathType: AgentFolderQueryPathType,
  suggestions: Schema.Array(AgentFolderSuggestion),
});

export class AgentFolderSuggestionsListError extends Schema.TaggedErrorClass<AgentFolderSuggestionsListError>()("AgentFolderSuggestionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type AgentFolderSuggestionsListPayload = typeof AgentFolderSuggestionsListPayload.Type;
export type AgentFolderSuggestionsListResult = typeof AgentFolderSuggestionsListResult.Type;
