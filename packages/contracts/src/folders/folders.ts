import {Schema} from "effect";

export const AgentFolderSuggestion = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
});
export type IAgentFolderSuggestion = typeof AgentFolderSuggestion.Type;

export const AgentFolderSuggestionsListResult = Schema.Struct({
  homePath: Schema.String,
  query: Schema.String,
  suggestions: Schema.Array(AgentFolderSuggestion),
});
export type IAgentFolderSuggestionsListResult = typeof AgentFolderSuggestionsListResult.Type;

export class AgentFolderSuggestionsListError extends Schema.TaggedErrorClass<AgentFolderSuggestionsListError>()("AgentFolderSuggestionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}
